from services.file_scanner import has_dangerous_files

def test_has_dangerous_files_found():
    files = [{"name": "file.exe"}, {"name": "normal.txt"}]
    dangerous = [".exe", ".scr"]
    assert has_dangerous_files(files, dangerous) is True

def test_has_dangerous_files_not_found():
    files = [{"name": "file.txt"}, {"name": "normal.jpg"}]
    dangerous = [".exe", ".scr"]
    assert has_dangerous_files(files, dangerous) is False

def test_has_dangerous_files_case_insensitive():
    files = [{"name": "FILE.EXE"}]
    dangerous = [".exe"]
    assert has_dangerous_files(files, dangerous) is True