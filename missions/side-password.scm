; =====================================================================
; Side mission — "Locked Out"
; Carla's account was taken over through password reuse.
; =====================================================================
SCRIPT_START side_password

LOCAL blip = 0
LOCAL passed = FALSE

SET_OBJECTIVE "Visit Carla at Coral Café."
ADD_BLIP "cafe" "yellow" -> blip
SET_WAYPOINT "cafe"

WHILE NOT IS_PLAYER_AT "cafe" 12.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
WAIT_FOR_TALK "carla"
SHOW_DIALOGUE "side_password.carla_brief"

lab:
SET_OBJECTIVE "Investigate the account takeover on the café PC."
START_CHALLENGE "password-1" "cafe-terminal" -> passed
IF NOT passed
    PRINT_HELP "Look for many failed logins across many accounts from one range: that's credential stuffing."
    GOTO lab
END_IF

SHOW_DIALOGUE "side_password.carla_done"
MISSION_COMPLETE
SCRIPT_END
