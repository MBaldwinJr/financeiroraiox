#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

location = Path(__file__).resolve().parents[2] / "scripts" / "migration" / "compare-manifests.py"
spec = importlib.util.spec_from_file_location("compare_manifests", location)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def fake_manifest():
    return {
        "tables": {"companies": 2, "sales": 20, "transactions": 100},
        "auth": {"users": 3, "identities": 3},
        "routines": ["public.some_function()"],
        "extensions": ["pgcrypto"],
        "jobs": ["daily-check"],
        "storage": {"buckets": 0, "objects": 0},
    }

class MigrationManifestTests(unittest.TestCase):
    def test_identical_manifests_pass(self):
        self.assertEqual(module.compare(fake_manifest(), fake_manifest()), [])
    def test_missing_financial_rows_block_migration(self):
        orig = fake_manifest()
        dest = fake_manifest()
        dest["tables"]["transactions"] = 99
        self.assertEqual(module.compare(orig, dest)[0][:2], ("table", "transactions"))
    def test_missing_users_and_routines_block_migration(self):
        orig = fake_manifest()
        dest = fake_manifest()
        dest["auth"]["identities"] = 2
        dest["routines"] = []
        diff = module.compare(orig, dest)
        self.assertEqual(len(diff), 2)
    def test_missing_table_blocks_migration(self):
        orig = fake_manifest()
        dest = fake_manifest()
        del dest["tables"]["sales"]
        self.assertEqual(len(module.compare(orig, dest)), 1)
    def test_invalid_manifest_is_rejected(self):
        broken = fake_manifest()
        broken["tables"]["transactions"] = True
        with self.assertRaises(ValueError):
            module.compare(broken, fake_manifest())
    def test_storage_object_mismatch_blocks_migration(self):
        orig = fake_manifest()
        dest = fake_manifest()
        dest["storage"]["objects"] = 1
        self.assertEqual(len(module.compare(orig, dest)), 1)

if __name__ == "__main__":
    unittest.main()
