; =====================================================================
; Side mission — "Voice on the Line"
; Work Palmetto Bank's help desk and spot the social engineers.
; =====================================================================
SCRIPT_START side_social

LOCAL blip = 0
LOCAL passed = FALSE

SET_OBJECTIVE "Go to Palmetto Bank Tower."
ADD_BLIP "bank" "yellow" -> blip
SET_WAYPOINT "bank"

WHILE NOT IS_PLAYER_AT "bank" 14.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
WAIT_FOR_TALK "marisol"
SHOW_DIALOGUE "side_social.marisol_brief"

desk:
SET_OBJECTIVE "Handle the help-desk requests."
START_CHALLENGE "social-1" "bank-terminal" -> passed
IF NOT passed
    PRINT_HELP "When in doubt, verify through a channel you already trust: call back the number on file."
    GOTO desk
END_IF

SHOW_DIALOGUE "side_social.marisol_done"
MISSION_COMPLETE
SCRIPT_END
