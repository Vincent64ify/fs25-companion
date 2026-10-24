"""Protocol v1: the envelope the mod writes and a model per known topic.

Every line of the mod's stream file is one envelope:

    {"v": 1, "seq": 1234, "t": 5123456, "topic": "player", "data": {...}}

The client forwards envelopes unchanged; the backend validates them here.
Topic models allow extra fields: topics may gain fields without a version
bump, and a topic this file doesn't know yet (a new collector) passes
through with only the envelope checked. Breaking changes bump ``v``.
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
}


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
    "Envelope", "TOPIC_MODELS", "parse_envelope",
]
