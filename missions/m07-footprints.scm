; =====================================================================
; Mission 7 — "Digital Footprints"
; Dr. Lena Okafor has the evidence. Build the attack timeline.
; =====================================================================
SCRIPT_START m07_footprints

LOCAL blip = 0
LOCAL passed = FALSE

SET_OBJECTIVE "Go to the Okafor Forensics Lab at Bayview University."
ADD_BLIP "university" "purple" -> blip
SET_WAYPOINT "university"

WHILE NOT IS_PLAYER_AT "university" 12.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
SET_OBJECTIVE "Talk to Dr. Lena Okafor."
WAIT_FOR_TALK "lena"
SHOW_DIALOGUE "m07.lena_brief"

evidence:
SET_OBJECTIVE "Reconstruct the incident timeline in the lab."
START_CHALLENGE "forensics-1" "uni-terminal" -> passed
IF NOT passed
    PRINT_HELP "Watch the timezones: some logs are UTC, others local time. Normalize before ordering."
    GOTO evidence
END_IF

SHOW_DIALOGUE "m07.lena_done"
MISSION_COMPLETE
SCRIPT_END
