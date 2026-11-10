#!/usr/bin/env python3
"""Create an indexed, read-optimized copy of CVDICT; never modify the source.

Examples:
  py scripts/prepare_dictionary.py data/raw/cvdict.sqlite data/cvdict-app.sqlite
  py scripts/prepare_dictionary.py data/raw/cvdict.sqlite data/cvdict-app.sqlite --force
"""
from __future__ import annotations

import argparse
import re
import sqlite3
import unicodedata
from pathlib import Path


def normalize_pinyin(value: str) -> str:
    value = value.strip().lower().replace('u:', 'v')
    value = unicodedata.normalize('NFD', value)
    value = value.replace('u\u0308', 'v')
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    return re.sub(r'[^a-z]', '', value)


def main() -> None:
    parser = argparse.ArgumentParser(description='Prepare CVDICT database for the bot')
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--force', action='store_true', help='Overwrite existing output')
    args = parser.parse_args()

    src = args.source.resolve()
    dst = args.output.resolve()
    if not src.is_file():
        parser.error(f'Source does not exist: {src}')
    if src == dst:
        parser.error('Source and output paths must differ')
    if dst.exists() and not args.force:
        parser.error(f'Output already exists: {dst}; pass --force to rebuild')
    dst.parent.mkdir(parents=True, exist_ok=True)
    # SQLite backup API also works when an existing database has a WAL sidecar.
    src_conn = sqlite3.connect(f'file:{src.as_posix()}?mode=ro', uri=True)
    try:
        if src_conn.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Source database failed integrity_check')
        required = {'entries', 'meanings'}
        available = {row[0] for row in src_conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not required.issubset(available):
            raise RuntimeError(f'Missing tables: {required - available}')
        if dst.exists():
            dst.unlink()
        dst_conn = sqlite3.connect(dst)
        try:
            src_conn.backup(dst_conn)
            dst_conn.execute('PRAGMA foreign_keys=ON')
            columns = {row[1] for row in dst_conn.execute('PRAGMA table_info(entries)')}
            if 'pinyin_plain' not in columns:
                dst_conn.execute('ALTER TABLE entries ADD COLUMN pinyin_plain TEXT')
            rows = dst_conn.execute('SELECT id, pinyin_raw FROM entries').fetchall()
            dst_conn.executemany(
                'UPDATE entries SET pinyin_plain=? WHERE id=?',
                ((normalize_pinyin(pinyin), entry_id) for entry_id, pinyin in rows),
            )
            dst_conn.execute('CREATE INDEX IF NOT EXISTS idx_entries_pinyin_plain ON entries(pinyin_plain)')
            # External-content FTS table: original meanings stay the source of truth.
            dst_conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS meanings_fts USING fts5(
                  meaning_vi, content='meanings', content_rowid='id',
                  tokenize='unicode61 remove_diacritics 2'
                )
            """)
            dst_conn.execute("INSERT INTO meanings_fts(meanings_fts) VALUES ('rebuild')")
            dst_conn.commit()
            integrity = dst_conn.execute('PRAGMA integrity_check').fetchone()[0]
            if integrity != 'ok':
                raise RuntimeError(f'Output integrity_check failed: {integrity}')
            entries = dst_conn.execute('SELECT COUNT(*) FROM entries').fetchone()[0]
            meanings = dst_conn.execute('SELECT COUNT(*) FROM meanings').fetchone()[0]
            fts = dst_conn.execute("SELECT COUNT(*) FROM meanings_fts WHERE meanings_fts MATCH 'hoc'").fetchone()[0]
            print(f'OK: {dst}')
            print(f'Entries: {entries:,}; Meanings: {meanings:,}; FTS matches for hoc: {fts:,}')
        finally:
            dst_conn.close()
    finally:
        src_conn.close()


if __name__ == '__main__':
    main()
