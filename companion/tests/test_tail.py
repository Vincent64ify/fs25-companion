import asyncio
import json
from pathlib import Path

from companion.commands import CommandWriter
from companion.tail import FileTail, parse_line, replay, tail


def append(path, text):
    with open(path, "ab") as f:
        f.write(text.encode("utf-8"))


def test_missing_file_yields_nothing(tmp_path):
    tail = FileTail(tmp_path / "stream.ndjson")
    assert tail.poll() == []


def test_reads_new_complete_lines(tmp_path):
    path = tmp_path / "stream.ndjson"
    tail = FileTail(path)
    append(path, '{"a":1}\n{"a":2}\n')
    assert tail.poll() == ['{"a":1}', '{"a":2}']
    assert tail.poll() == []
    append(path, '{"a":3}\n')
    assert tail.poll() == ['{"a":3}']


def test_partial_line_waits_for_the_rest(tmp_path):
    path = tmp_path / "stream.ndjson"
    tail = FileTail(path)
    append(path, '{"a":1}\n{"a":')
    assert tail.poll() == ['{"a":1}']
    append(path, '2}\n')
    assert tail.poll() == ['{"a":2}']


def test_rotation_restarts_from_the_beginning(tmp_path):
    path = tmp_path / "stream.ndjson"
    tail = FileTail(path)
    append(path, '{"seq":1}\n{"seq":2}\n{"seq":3,"cut')
    assert tail.poll() == ['{"seq":1}', '{"seq":2}']
    # the mod reopens the file with "w": it shrinks and refills
    path.write_bytes(b'{"seq":4}\n')
    assert tail.poll() == ['{"seq":4}'], "the old partial line is dropped"
    assert tail.rotations == 1


def hello_line(session, seq):
    return json.dumps({"data": {"sessionId": session, "commands": {"next": 1}}, "seq": seq,
                       "t": 0, "topic": "hello", "v": 1}) + "\n"


def test_same_size_replacement_is_a_new_file(tmp_path):
    """specs/0005, the review's F2 case: the new file isn't smaller."""
    path = tmp_path / "stream.ndjson"
    tail = FileTail(path)
    append(path, '{"old":1}\n')
    assert tail.poll() == ['{"old":1}']
    path.write_bytes(b'{"new":2}\n')
    assert tail.poll() == ['{"new":2}']
    assert tail.rotations == 1


def test_larger_replacement_starts_with_its_hello(tmp_path):
    path = tmp_path / "stream.ndjson"
    tail = FileTail(path)
    append(path, hello_line("A", 1) + '{"seq":2}\n')
    tail.poll()
    # a game reload: the new file outgrew the old offset before the next poll
    path.write_bytes((hello_line("B", 1) + '{"seq":2,"topic":"farmland_grid"}\n' * 20).encode())
    lines = tail.poll()
    assert json.loads(lines[0])["data"]["sessionId"] == "B"
    assert len(lines) == 21, "the whole new file, nothing of the old"
    assert tail.rotations == 1


def test_old_partial_line_dropped_across_a_larger_replacement(tmp_path):
    path = tmp_path / "stream.ndjson"
    tail = FileTail(path)
    append(path, '{"seq":1}\n{"seq":2,"cu')
    assert tail.poll() == ['{"seq":1}']
    path.write_bytes(b'{"seq":9}\n{"seq":10}\n{"seq":11}\n')
    assert tail.poll() == ['{"seq":9}', '{"seq":10}', '{"seq":11}']


def test_growing_file_is_not_a_new_file(tmp_path):
    path = tmp_path / "stream.ndjson"
    tail = FileTail(path)
    append(path, '{"seq":1,"topic":"hel')  # the first line still being written
    assert tail.poll() == []
    append(path, 'lo"}\n{"seq":2}\n')
    assert tail.poll() == ['{"seq":1,"topic":"hello"}', '{"seq":2}']
    for n in range(3, 50):
        append(path, '{"seq":%d}\n' % n)
        assert tail.poll() == ['{"seq":%d}' % n]
    assert tail.rotations == 0


def test_skip_to_end_still_knows_a_new_file(tmp_path):
    path = tmp_path / "stream.ndjson"
    append(path, '{"old":1}\n')
    tail = FileTail(path)
    tail.skip_to_end()
    append(path, '{"old":2}\n')
    assert tail.poll() == ['{"old":2}']
    path.write_bytes(b'{"new":1}\n{"new":2}\n')
    assert tail.poll() == ['{"new":1}', '{"new":2}']
    assert tail.rotations == 1


def test_tail_passes_the_new_hello_on_after_a_same_size_replacement(tmp_path):
    path = tmp_path / "stream.ndjson"
    writer = CommandWriter(tmp_path / "cmd", lambda _: None)

    async def sink(envelopes):
        for e in envelopes:
            if e["topic"] == "hello":
                writer.on_hello(e["data"])

    append(path, hello_line("A", 1))

    async def run():
        task = asyncio.create_task(tail(path, sink, None))
        for _ in range(100):
            await asyncio.sleep(0.01)
            if writer.session == "A":
                break
        path.write_bytes(hello_line("B", 1).encode())
        for _ in range(100):
            await asyncio.sleep(0.01)
            if writer.session == "B":
                break
        task.cancel()

    asyncio.run(run())
    assert writer.session == "B"


def test_file_deleted_and_recreated(tmp_path):
    path = tmp_path / "stream.ndjson"
    tail = FileTail(path)
    append(path, '{"a":1}\n')
    tail.poll()
    path.unlink()
    assert tail.poll() == []
    append(path, '{"a":2}\n')
    assert tail.poll() == ['{"a":2}']


def test_crlf_and_blank_lines(tmp_path):
    path = tmp_path / "stream.ndjson"
    tail = FileTail(path)
    append(path, '{"a":1}\r\n\n{"a":2}\n')
    assert tail.poll() == ['{"a":1}', '{"a":2}']


def test_parse_line():
    assert parse_line('{"v":1,"seq":1,"t":0,"topic":"env","data":{}}')["topic"] == "env"
    assert parse_line('{"v":1,"seq":1,"t":0,"topic":"env","data":{') is None
    assert parse_line("[]") is None
    assert parse_line('{"topic":"env"}') is None, "no data"
    assert parse_line("not json") is None


def test_tail_hands_on_one_read_at_a_time_and_records_it(tmp_path):
    path = tmp_path / "stream.ndjson"
    append(path, '{"v":1,"seq":1,"t":0,"topic":"a","data":{}}\nnot json\n'
                 '{"v":1,"seq":2,"t":0,"topic":"b","data":{}}\n')
    reads = []

    async def sink(batch):
        reads.append(batch)

    async def run():
        with open(tmp_path / "rec.ndjson", "w", encoding="utf-8", newline="\n") as record:
            task = asyncio.create_task(tail(path, sink, record))
            for _ in range(100):
                await asyncio.sleep(0.01)
                if reads:
                    break
            task.cancel()

    asyncio.run(run())
    assert [[e["seq"] for e in batch] for batch in reads] == [[1, 2]]
    # the recording keeps every line, the ones that aren't envelopes too
    assert (tmp_path / "rec.ndjson").read_text(encoding="utf-8").splitlines()[1] == "not json"


def test_replay_feeds_the_fixture_one_envelope_at_a_time():
    fixture = Path(__file__).resolve().parents[2] / "fixtures" / "solek_v1.ndjson"
    reads = []

    async def sink(batch):
        reads.append(batch)

    asyncio.run(replay(fixture, sink, speed=1e9))
    assert all(len(batch) == 1 for batch in reads)
    assert reads[0][0]["topic"] == "hello"
    assert len(reads) == sum(1 for _ in open(fixture, encoding="utf-8"))
