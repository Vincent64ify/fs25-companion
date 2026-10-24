"""Protocol v1: the envelope the mod writes and a model per known topic.

Every line of the mod's stream file is one envelope:

    {"v": 1, "seq": 1234, "t": 5123456, "topic": "player", "data": {...}}

The client forwards envelopes unchanged; the backend validates them here.
Topic models allow extra fields: topics may gain fields without a version
bump, and a topic this file doesn't know yet (a new collector) passes
through with only the envelope checked. Breaking changes bump ``v``.

``command_ack`` is an event, not state: the mod's answer to one dashboard
command, relayed to the viewer that sent it and never stored (see
EVENT_TOPICS). The commands a viewer may send are in COMMAND_ACTIONS.
"""

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

PROTOCOL_VERSION = 1

TOPIC_PATTERN = r"^[a-z][a-z0-9_]{0,31}$"


class ProtocolVersionError(ValueError):
    def __init__(self, got: Any):
        super().__init__(
            f"mod speaks protocol v{got}, this backend speaks v{PROTOCOL_VERSION}: "
            "update the mod and the companion so they match")
        self.got = got


class Envelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    v: int
    seq: int = Field(ge=0)
    t: float
    topic: str = Field(pattern=TOPIC_PATTERN)
    data: Dict[str, Any]


class TopicModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class IngameMap(TopicModel):
    worldSizeX: Optional[float] = None
    worldSizeZ: Optional[float] = None
    worldCenterOffsetX: Optional[float] = None
    worldCenterOffsetZ: Optional[float] = None
    mapExtensionScaleFactor: Optional[float] = None
    mapExtensionOffsetX: Optional[float] = None
    mapExtensionOffsetZ: Optional[float] = None


class CommandDir(TopicModel):
    """Where the client writes commands, and the number the mod reads next."""
    dir: Optional[str] = None
    next: int = Field(default=1, ge=1)


class Hello(TopicModel):
    protocolVersion: int
    sessionId: str
    modVersion: Optional[str] = None
    platform: Optional[str] = None
    mapId: Optional[str] = None
    mapTitle: Optional[str] = None
    mapDir: Optional[str] = None
    mapXmlFilename: Optional[str] = None
    isModMap: bool = False
    isMultiplayer: bool = False
    terrainSize: Optional[float] = None
    ingameMap: Optional[IngameMap] = None
    farmId: Optional[int] = None
    playerName: Optional[str] = None
    profileDir: Optional[str] = None
    gameDir: Optional[str] = None
    commands: Optional[CommandDir] = None


class Weather(TopicModel):
    tempMin: Optional[float] = None
    tempMax: Optional[float] = None
    tempTrend: Optional[float] = None
    current: Optional[Union[int, str]] = None
    next: Optional[Union[int, str]] = None


class Units(TopicModel):
    """The player's unit settings; missing ones mean metric."""
    miles: Optional[bool] = None
    fahrenheit: Optional[bool] = None
    acres: Optional[bool] = None
    currency: Optional[str] = None


class Env(TopicModel):
    day: Optional[int] = None
    dayTimeMinutes: Optional[int] = None
    season: Optional[int] = None
    # 1 = January; the game's period 1 is March
    month: Optional[int] = Field(default=None, ge=1, le=12)
    weather: Optional[Weather] = None
    # farmId (as a string) -> money
    money: Optional[Dict[str, float]] = None
    units: Optional[Units] = None


class Pose(TopicModel):
    x: float
    z: float
    y: Optional[float] = None
    # degrees, 0 = north (-Z), clockwise
    heading: Optional[float] = Field(default=None, ge=0, lt=360)


class Player(Pose):
    inVehicle: bool = False
    vehicleId: Optional[Union[int, str]] = None
    farmId: Optional[int] = None


class FillLevel(TopicModel):
    """One fill unit: a trailer's load, a sprayer's tank. An empty unit has
    no fill type."""
    unit: Optional[int] = None
    level: float = Field(default=0, ge=0)
    capacity: float = Field(gt=0)
    # the game's fill type name, lower case ("wheat")
    fillType: Optional[str] = None
    fillTitle: Optional[str] = None


class Implement(TopicModel):
    name: Optional[str] = None
    depth: int = 1
    lowered: bool = False
    turnedOn: bool = False
    wear: Optional[float] = None
    # the PTO turns; None: no PTO
    pto: Optional[bool] = None
    # the hitch holding it, 0 raised .. 1 lowered; None: a fixed joint
    hitch: Optional[float] = Field(default=None, ge=0, le=1)
    fills: List[FillLevel] = []


class Lights(TopicModel):
    on: bool = False
    # the light key's stage, 0 = off, of `stages`; None: not readable
    stage: Optional[int] = Field(default=None, ge=0)
    stages: Optional[int] = Field(default=None, ge=1)
    high: bool = False
    left: bool = False
    right: bool = False
    hazard: bool = False
    beacon: bool = False


class Cruise(TopicModel):
    # off, on (holds the set speed) or full (full throttle)
    state: str
    # km/h
    speed: Optional[float] = None
    maxSpeed: Optional[float] = None


class AiWorker(TopicModel):
    job: Optional[str] = None
    description: Optional[str] = None
    helper: Optional[str] = None


class Vehicle(Pose):
    id: Union[int, str]
    typeName: Optional[str] = None
    name: Optional[str] = None
    farmId: Optional[int] = None
    isAI: bool = False
    speed: Optional[float] = None
    rpm: Optional[float] = None
    rpmMin: Optional[float] = None
    rpmMax: Optional[float] = None
    gear: Optional[Union[int, str]] = None
    fuel: Optional[float] = None
    fuelCapacity: Optional[float] = None
    fuelType: Optional[str] = None
    # litres (kWh for electric) per hour
    fuelUsage: Optional[float] = None
    # DEF (AdBlue), litres
    def_: Optional[float] = Field(default=None, alias="def")
    defCapacity: Optional[float] = None
    cruise: Optional[Cruise] = None
    # a PTO turns; None: no implement has one
    pto: Optional[bool] = None
    # the vehicle's own fill units, without its fuel
    fills: List[FillLevel] = []
    ai: Optional[AiWorker] = None
    motorTemp: Optional[float] = None
    engineOn: Optional[bool] = None
    wear: Optional[float] = None
    operatingHours: Optional[float] = None
    mass: Optional[float] = None
    lights: Optional[Lights] = None
    # the encoder writes an empty table as [], so an empty object may too
    implements: List[Implement] = []
    # has an engine (tractors, trucks) vs implements and trailers
    motorized: Optional[bool] = None
    # hitched to another vehicle
    attached: Optional[bool] = None
    propertyState: Optional[int] = None


class CabImplement(TopicModel):
    lowered: bool = False
    turnedOn: bool = False


class CabCruise(TopicModel):
    state: str
    # the set speed and the highest one, km/h
    speed: Optional[float] = None
    maxSpeed: Optional[float] = None


class SelectedImplement(TopicModel):
    """The implement the game's implement keys act on."""
    name: Optional[str] = None
    lowered: bool = False
    canLower: bool = True
    turnedOn: bool = False
    canTurnOn: bool = False
    foldable: bool = False
    # None: foldable, but the game doesn't say which end it's at
    unfolded: Optional[bool] = None
    foldMoving: bool = False


class Cab(TopicModel):
    """What the dashboard's controls show, sent the frame it changes."""
    inVehicle: bool = False
    vehicleId: Optional[Union[int, str]] = None
    engineOn: Optional[bool] = None
    # off, starting or on: starting takes a few seconds in game
    engineState: Optional[str] = None
    lights: Optional[Lights] = None
    cruise: Optional[CabCruise] = None
    aiActive: Optional[bool] = None
    # something is attached to the vehicle
    hitched: Optional[bool] = None
    implement: Optional[SelectedImplement] = None
    implements: List[CabImplement] = []


class CommandAck(TopicModel):
    """The mod's answer to one command: id is the command file's number,
    ref the backend's reference for it."""
    id: Optional[int] = None
    ref: Optional[str] = None
    action: Optional[str] = None
    ok: bool
    reason: Optional[str] = None
    # what ran: the input action's name, or "setter"
    via: Optional[str] = None


class Vehicles(TopicModel):
    vehicles: List[Vehicle] = []
    controlledId: Optional[Union[int, str]] = None


class Hotspot(TopicModel):
    # MapHotspot.CATEGORY_*: ANIMAL 2, MISSION 3, TOUR 4, UNLOADING 9 (sell
    # points), LOADING 10, PRODUCTION 11, SHOP 12, OTHER 13
    category: int
    x: float
    z: float
    name: Optional[str] = None
    farmId: Optional[int] = None
    visible: bool = True


class Hotspots(TopicModel):
    hotspots: List[Hotspot] = []


class Farmland(TopicModel):
    id: int
    # 0 = nobody owns it
    farmId: int = 0
    price: Optional[float] = None
    areaHa: Optional[float] = None
    x: Optional[float] = None
    z: Optional[float] = None
    name: Optional[str] = None
    listed: bool = True


class Farmlands(TopicModel):
    farmlands: List[Farmland] = []


class FarmlandGrid(TopicModel):
    """Farmland id per cell, row by row from (originX, originZ), run-length
    encoded as [id, count, id, count, ...]; id 0 = no farmland."""
    cell: float = Field(gt=0)
    cols: int = Field(gt=0)
    rows: int = Field(gt=0)
    originX: float
    originZ: float
    runs: List[int]

    @model_validator(mode="after")
    def runs_cover_the_grid(self):
        if len(self.runs) % 2:
            raise ValueError("runs must be [id, count] pairs")
        counts = self.runs[1::2]
        if any(n <= 0 for n in counts) or sum(counts) != self.cols * self.rows:
            raise ValueError("run counts must add up to cols * rows")
        return self


class FieldOutline(TopicModel):
    id: int
    # flattened [x1, z1, x2, z2, ...] in world meters
    points: List[float]

    @model_validator(mode="after")
    def at_least_a_triangle(self):
        if len(self.points) % 2 or len(self.points) < 6:
            raise ValueError("points must be at least three x, z pairs")
        return self


class FieldOutlines(TopicModel):
    fields: List[FieldOutline] = []


class FieldEntry(TopicModel):
    """One field's crop and soil state: the game's fieldState values."""
    id: int
    farmlandId: Optional[int] = None
    x: Optional[float] = None
    z: Optional[float] = None
    areaHa: Optional[float] = None
    # 0 = no crop; an index into crop_types.fruits
    fruitTypeIndex: Optional[int] = None
    growthState: Optional[int] = None
    groundType: Optional[int] = None
    sprayLevel: Optional[int] = None
    sprayType: Optional[int] = None
    limeLevel: Optional[int] = None
    plowLevel: Optional[int] = None
    rollerLevel: Optional[int] = None
    stubbleShredLevel: Optional[int] = None
    weedState: Optional[int] = None
    stoneLevel: Optional[int] = None


class Fields(TopicModel):
    fields: List[FieldEntry] = []


class Fruit(TopicModel):
    index: int
    name: Optional[str] = None
    title: Optional[str] = None
    # the PDA's crop colours, [r, g, b] in 0..1 as the game stores them
    color: Optional[List[float]] = Field(default=None, min_length=3, max_length=3)
    colorBlindColor: Optional[List[float]] = Field(default=None, min_length=3, max_length=3)
    numGrowthStates: Optional[int] = None
    minHarvest: Optional[int] = None
    maxHarvest: Optional[int] = None
    withered: Optional[int] = None
    cut: Optional[int] = None
    minPrepare: Optional[int] = None
    maxPrepare: Optional[int] = None
    regrows: bool = False
    shownOnMap: bool = True
    # growth state (as a string) -> the game's state name
    stateNames: Optional[Dict[str, str]] = None


class Levels(TopicModel):
    lime: Optional[int] = None
    plow: Optional[int] = None
    spray: Optional[int] = None


class CropTypes(TopicModel):
    fruits: List[Fruit] = []
    # FieldGroundType constant name -> value
    groundTypes: Optional[Dict[str, int]] = None
    levels: Optional[Levels] = None


TOPIC_MODELS = {
    "hello": Hello,
    "env": Env,
    "player": Player,
    "vehicles": Vehicles,
    "hotspots": Hotspots,
    "farmlands": Farmlands,
    "farmland_grid": FarmlandGrid,
    "crop_types": CropTypes,
    "field_outlines": FieldOutlines,
    "fields": Fields,
    "cab": Cab,
    "command_ack": CommandAck,
}

# topics that are events: relayed, never kept in the state store
EVENT_TOPICS = {"command_ack"}

# The commands a dashboard may send ({"type": "command", "id", "action"}).
# The only list on the backend; the client and the mod keep their own.
COMMAND_ACTIONS = frozenset({
    "lights.toggle", "highBeam.toggle", "beacon.toggle", "hazard.toggle",
    "turnLeft.toggle", "turnRight.toggle",
    "engine.toggle", "cruise.toggle", "cruise.down", "cruise.up", "ai.toggle",
    "implement.lower", "implement.fold", "implement.turnOn", "hitch.toggle",
    "cruise.set",
    "implement.select", "implement.next", "implement.previous", "implement.detach",
})

# Actions that carry a number ({"value": ...}) and its allowed range. Any
# other action carries none.
COMMAND_VALUES = {
    # the cruise control's set speed for the current direction, km/h
    "cruise.set": (1.0, 250.0),
    # a tool's id, the cab's rig (C3)
    "implement.select": (0, 2**31),
    "implement.detach": (0, 2**31),
}


def command_value_ok(action: str, value: Any) -> bool:
    """Whether value fits the action: a number in range for an action in
    COMMAND_VALUES, else absent."""
    limits = COMMAND_VALUES.get(action)
    if limits is None:
        return value is None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return limits[0] <= value <= limits[1]


def parse_envelope(raw: Any) -> Dict[str, Any]:
    """Validate one envelope and return it as a plain dict.

    The returned dict is the input, unchanged: known topics are validated
    but not reserialized, so extra fields reach the dashboard as sent.
    Raises ProtocolVersionError on a version mismatch and ValidationError
    on anything malformed.
    """
    if isinstance(raw, dict) and "v" in raw and raw["v"] != PROTOCOL_VERSION:
        raise ProtocolVersionError(raw["v"])
    envelope = Envelope.model_validate(raw)
    model = TOPIC_MODELS.get(envelope.topic)
    if model is not None:
        model.model_validate(envelope.data)
    return raw


__all__ = [
    "PROTOCOL_VERSION", "ProtocolVersionError", "ValidationError",
    "Envelope", "TOPIC_MODELS", "EVENT_TOPICS", "COMMAND_ACTIONS", "COMMAND_VALUES",
    "command_value_ok", "parse_envelope",
]
