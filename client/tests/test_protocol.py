"""Unit tests for the fssimx wire-format parser."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from protocol import FrameParser  # noqa: E402


def test_basic_frame():
    p = FrameParser()
    stream = (b"HEADER<Day<Speed<VehicleName<BODY<12<35.5<John<"
              b"HEADER<Day<Speed<VehicleName<BODY<13<36.0<John<")
    frames = list(p.feed(stream))
    assert frames[0] == {"Day": 12, "Speed": 35.5, "VehicleName": "John"}
    assert frames[1] == {"Day": 13, "Speed": 36.0, "VehicleName": "John"}


def test_byte_by_byte_feed():
    p = FrameParser()
    stream = b"HEADER<Fuel<IsDrivingVehicle<BODY<0.75<1<"
    frames = []
    for i in range(len(stream)):
        frames.extend(p.feed(stream[i:i + 1]))
    assert frames == [{"Fuel": 0.75, "IsDrivingVehicle": True}]


def test_table_value():
    p = FrameParser()
    frames = list(p.feed(
        b"HEADER<AttachedImplementsLowered<AttachedImplementsPosition<BODY<0>1>0<1>2>3<"))
    assert frames[0]["AttachedImplementsLowered"] == [0.0, 1.0, 0.0]
    assert frames[0]["AttachedImplementsPosition"] == [1, 2, 3]


def test_resync_after_partial_stream():
    p = FrameParser()
    # tokens before the first HEADER are dropped
    frames = list(p.feed(b"9.5<1<HEADER<Fuel<BODY<0.5<"))
    assert frames == [{"Fuel": 0.5}]


def test_mismatched_body_is_discarded():
    p = FrameParser()
    # body claims 2 keys but only 1 value arrives before the next header
    frames = list(p.feed(
        b"HEADER<A<B<BODY<1<HEADER<A<B<BODY<2<3<"))
    assert frames == [{"A": 2, "B": 3}]


if __name__ == "__main__":
    test_basic_frame()
    test_byte_by_byte_feed()
    test_table_value()
    test_resync_after_partial_stream()
    test_mismatched_body_is_discarded()
    print("all protocol tests passed")
