import unittest

from identity_gate import combine_identities, parse_identity


class IdentityGateTests(unittest.TestCase):
    def test_known_design_is_only_a_suggestion(self):
        result = parse_identity('{"design_id":"american_eagle"}')
        self.assertFalse(result['can_create_holding'])
        self.assertTrue(result['needs_independent_specifications'])
        self.assertNotIn('weight', result)

    def test_actual_wrong_weight_shape_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_identity('{"product_family":"American Eagle","metal":"Silver",'
                           '"weight_oz":"20.0","year":"2011","uncertain_fields":null}')

    def test_identity_with_specifications_is_rejected(self):
        for field in ['weight_oz', 'year', 'metal', 'readable_markings', 'confidence']:
            with self.subTest(field=field), self.assertRaises(ValueError):
                parse_identity('{"design_id":"american_eagle","' + field + '":1}')

    def test_unknown_does_not_request_specification_validation(self):
        self.assertFalse(parse_identity('{"design_id":"unknown"}')['needs_independent_specifications'])

    def test_unsupported_ids_and_malformed_replies(self):
        for reply in ['{"design_id":"silver_round"}', '[]', 'null',
                      '{"design_id":true}', '{"design_id":[]}',
                      '{"design_id":"unknown","design_id":"american_eagle"}',
                      '{"design_id":"american_eagle"} trailing text', 'x' * 1025]:
            with self.subTest(reply=reply), self.assertRaises(ValueError):
                parse_identity(reply)

    def test_conflicting_sides_block_identity(self):
        result = combine_identities(parse_identity('{"design_id":"american_eagle"}'),
                                    parse_identity('{"design_id":"canadian_maple_leaf"}'))
        self.assertTrue(result['conflicting_sides'])
        self.assertFalse(result['can_create_holding'])
        self.assertEqual(result['design_id'], 'unknown')

    def test_unknown_side_does_not_invent_additional_evidence(self):
        result = combine_identities(parse_identity('{"design_id":"american_eagle"}'),
                                    parse_identity('{"design_id":"unknown"}'))
        self.assertEqual(result['design_id'], 'american_eagle')
        self.assertFalse(result['can_create_holding'])


if __name__ == '__main__':
    unittest.main()
