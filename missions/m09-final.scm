; =====================================================================
; Mission 9 — "The Final Incident"
; Pink Tide hits Palmetto Bank. Command the response, end to end.
; =====================================================================
SCRIPT_START m09_final

LOCAL blip = 0
LOCAL passed = FALSE

SHOW_DIALOGUE "m09.alarm"
PRINT_MESSAGE "PALMETTO BANK UNDER ATTACK" 3000
SET_OBJECTIVE "Get to Palmetto Bank Tower downtown."
ADD_BLIP "bank" "red" -> blip
SET_WAYPOINT "bank"

WHILE NOT IS_PLAYER_AT "bank" 14.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
WAIT_FOR_TALK "marisol"
SHOW_DIALOGUE "m09.marisol_brief"

command:
SET_OBJECTIVE "Lead the incident response from the bank's command console."
START_CHALLENGE "incident-1" "bank-terminal" -> passed
IF NOT passed
    PRINT_HELP "Follow the playbook: preserve evidence, contain, eradicate, recover, then report. Never pay the ransom."
    GOTO command
END_IF

FADE_OUT 1200
SHOW_DIALOGUE "m09.ending"
FADE_IN 1200
UNLOCK_NOTE "Neon Bay is safe. Free roam and side missions remain open."
MISSION_COMPLETE
SCRIPT_END
