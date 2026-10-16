import unittest

import update_data


class UnscoredModelTests(unittest.TestCase):
    def test_valid_unscored_model_keeps_null_indices(self) -> None:
        model = update_data.normalize_model(
            {"id": "new-model", "name": "New Unscored Model", "model_creator": {"name": "Example"}},
            "2026-10-16T00:00:00Z",
            "4.3",
        )
        self.assertEqual(len(model["indices"]), 9)
        self.assertTrue(all(value is None for value in model["indices"].values()))
        self.assertIsNone(model["intelligence_cost_per_task_usd"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
