; =====================================================================
; Season 2, Mission 4: "Patch Night"
; A countdown on the bank's login page. Fix the web app before midnight.
; Teaches: injection, XSS, access control, headers, responsible disclosure.
; =====================================================================
SCRIPT_START s2_04_patchnight

LOCAL passed = FALSE
LOCAL blip = 0

CINEMATIC_START
SET_HOUR 23.6
MUSIC_CUE "tension"
CAMERA_SHOT "skyline" "city" 3000
SHOW_TITLE "Patch Night" "Nineteen minutes to midnight" 3000
SHOW_DIALOGUE "s2.s2e4_clock"
CINEMATIC_END

MUSIC_CUE "action"
SET_OBJECTIVE "Get to Palmetto Bank before midnight."
ADD_BLIP "bank" "yellow" -> blip
SET_WAYPOINT "bank"
SET_TIMER 300
WHILE NOT IS_PLAYER_AT "bank" 14.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip
CLEAR_WAYPOINT

patch:
SET_OBJECTIVE "Patch the bank's web app at the help desk."
START_CHALLENGE "web-1" "bank-terminal" -> passed
IF NOT passed
    PRINT_HELP "A hole is still open. Fix the root cause, not the symptom, then use the help desk again."
    GOTO patch
END_IF
CLEAR_TIMER

CINEMATIC_START
SET_HOUR 0.0
MUSIC_CUE "triumph"
CAMERA_SHOT "establish" "bank" 3000
SHOW_DIALOGUE "s2.s2e4_midnight"
SHOW_DIALOGUE "s2.priya_done"
CINEMATIC_END
MISSION_COMPLETE
SCRIPT_END
