"""Protocol v1: the envelope the mod writes and a model per known topic.

Every line of the mod's stream file is one envelope:

    {"v": 1, "seq": 1234, "t": 5123456, "topic": "player", "data": {...}}

The client forwards envelopes unchanged; the backend validates them here.
Topic models allow extra fields: topics may gain fields without a version
bump, and a topic this file doesn't know yet (a new collector) passes
through with only the envelope checked. Breaking changes bump ``v``.
"""

from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, ValidationError

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


class Weather(TopicModel):
    tempMin: Optional[float] = None
    tempMax: Optional[float] = None
    tempTrend: Optional[float] = None
    current: Optional[Union[int, str]] = None
    next: Optional[Union[int, str]] = None


class Env(TopicModel):
    day: Optional[int] = None
    dayTimeMinutes: Optional[int] = None
    season: Optional[int] = None
    weather: Optional[Weather] = None
    # farmId (as a string) -> money
    money: Optional[Dict[str, float]] = None


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


class Implement(TopicModel):
    name: Optional[str] = None
    depth: int = 1
    lowered: bool = False
    turnedOn: bool = False
    wear: Optional[float] = None


class Lights(TopicModel):
    on: bool = False
    high: bool = False
    left: bool = False
    right: bool = False
    hazard: bool = False
    beacon: bool = False


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
    motorTemp: Optional[float] = None
    engineOn: Optional[bool] = None
    wear: Optional[float] = None
    operatingHours: Optional[float] = None
    mass: Optional[float] = None
    lights: Optional[Lights] = None
    # the encoder writes an empty table as [], so an empty object may too
    implements: List[Implement] = []


class Vehicles(TopicModel):
    vehicles: List[Vehicle] = []
    controlledId: Optional[Union[int, str]] = None


TOPIC_MODELS = {
    "hello": Hello,
    "env": Env,
    "player": Player,
    "vehicles": Vehicles,
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
