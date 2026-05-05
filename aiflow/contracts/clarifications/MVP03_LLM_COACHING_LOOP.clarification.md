# MVP03_LLM_COACHING_LOOP Clarification

## Provider Boundary

MVP03 accepts a replaceable generator boundary. The accepted implementation may use `local_rule_template` instead of a real LLM API as long as the output file structure, provider metadata, and safety boundaries match the future LLM path.

## Safety Boundary

`drill_spec_candidate` is only a candidate for MVP04. It may reference a whitelist `template_id` and whitelist parameter names, but it must not contain Unreal console commands, free-form scene creation instructions, Blueprint editing instructions, or asset mutation requests.

## Coaching Scope

Each review card must focus on one main issue from `diagnosis.final.primary_failure`. MVP03 should not blend multiple lessons into one card, because the product goal is that the player can try one concrete action in the next attempt.
