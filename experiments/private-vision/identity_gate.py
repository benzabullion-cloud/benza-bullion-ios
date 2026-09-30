"""Experimental protocol boundary. A model identity never constitutes a holding."""
import json

DESIGNS = frozenset({'american_eagle', 'walking_liberty_half_dollar',
                     'canadian_maple_leaf', 'unknown'})


def parse_identity(reply):
    if not isinstance(reply, str) or len(reply) > 1024:
        raise ValueError('Invalid identity response')
    text = reply.strip()
    if text.startswith('```json\n') and text.endswith('\n```'):
        text = text[8:-4].strip()
    # Duplicate keys must not allow a later identifier to replace the first.
    def unique_object(pairs):
        obj = {}
        for key, value in pairs:
            if key in obj:
                raise ValueError('Duplicate response field')
            obj[key] = value
        return obj
    try:
        value = json.loads(text, object_pairs_hook=unique_object)
    except (json.JSONDecodeError, TypeError) as error:
        raise ValueError('Invalid identity response') from error
    if not isinstance(value, dict) or set(value) != {'design_id'}:
        raise ValueError('Only a design identifier is allowed')
    design = value['design_id']
    if not isinstance(design, str) or design not in DESIGNS:
        raise ValueError('Unsupported design identifier')
    # Deliberately no weight, metal, year, confidence or model transcription.
    return {'design_id': design, 'can_create_holding': False,
            'needs_independent_specifications': design != 'unknown'}


def combine_identities(front, back):
    """Combine already parsed identities from the same scan only."""
    values = {front['design_id'], back['design_id']} - {'unknown'}
    if len(values) != 1:
        return {'design_id': 'unknown', 'can_create_holding': False,
                'needs_independent_specifications': False,
                'conflicting_sides': len(values) > 1}
    return {'design_id': values.pop(), 'can_create_holding': False,
            'needs_independent_specifications': True, 'conflicting_sides': False}
