"""Regression: real-game frames contain EMPTY values ("BODY<<<<<6<...").

The parser used to discard empty tokens, so the value list never matched
the key list and no frame ever completed — while the pipe side streamed
perfectly (proven 2026-10-19 by pipe_probe.py capturing 1286 frames while
the client relayed zero). Empty tokens are real "" fields.
"""

from protocol import FrameParser


def test_frame_with_empty_values():
    p = FrameParser()
    # Real shape from the probe capture (sess-9287123 stream):
    # "BODY<<<<<6<1087<...<sess-9287123<0<31<"
    frames = list(p.feed(
        b"HEADER<SessionId<MapName<PlayerName<VehicleName<Day<"
        b"BODY<sess-9287123<<<<31<"))
    assert len(frames) == 1
    f = frames[0]
    assert f["SessionId"] == "sess-9287123"
    assert f["MapName"] == ""      # empty token must not be dropped
    assert f["PlayerName"] == ""
    assert f["VehicleName"] == ""
    assert f["Day"] == 31


def test_two_frames_with_partial_empty_values():
    # 'c' is a table value in the real format: items joined with '>'
    # ("3>3>"), and NO '>' wrapping for empty tables ("").
    p = FrameParser()
    frames = list(p.feed(
        b"HEADER<a<b<c<d<BODY<v1<<3>3<2<"
        b"HEADER<a<b<c<d<BODY<<v2<5>5<4<"))
    assert len(frames) == 2
    assert frames[0] == {"a": "v1", "b": "", "c": [3, 3], "d": 2}
    assert frames[1] == {"a": "", "b": "v2", "c": [5, 5], "d": 4}
