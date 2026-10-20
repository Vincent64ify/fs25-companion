from transport.file_tail import FileTail, parse_line


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
