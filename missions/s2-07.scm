; =====================================================================
; Season 2, Mission 7: "Blackout Protocol"
; A storm, a dark city, a power station under attack, and a friend's betrayal.
; Teaches: OT/ICS safety, IT/OT segmentation, insider threats and coercion.
; =====================================================================
SCRIPT_START s2_07_blackout

LOCAL passed = FALSE
LOCAL blip = 0

CINEMATIC_START
SET_HOUR 23.8
SET_WEATHER "storm"
MUSIC_CUE "tension"
CAMERA_SHOT "skyline" "city" 3000
PLAY_SFX "crash"
SCREEN_SHAKE 0.6
SHOW_TITLE "Blackout Protocol" "Neon Bay Power Station" 3000
SHOW_DIALOGUE "s2.s2e7_storm"
CAMERA_SHOT "establish" "powerplant" 3000
CAMERA_SHOT "closeup" "kai" 2500
CINEMATIC_END

MUSIC_CUE "action"
grid:
SET_OBJECTIVE "Defend the power station from the control room."
START_CHALLENGE "grid-1" "grid-terminal" -> passed
IF NOT passed
    PRINT_HELP "The relays are still exposed. Safety first: isolate, then restore. Use the control room again."
    GOTO grid
END_IF

CINEMATIC_START
SLOW_MOTION 0.5 2000
PLAY_SFX "good"
SHOW_DIALOGUE "s2.s2e7_light"
MUSIC_CUE "sorrow"
SHOW_DIALOGUE "s2.s2e7_call"
CINEMATIC_END

MUSIC_CUE "tension"
SET_OBJECTIVE "Find Jules at the Harbor Docks."
ADD_BLIP "docks" "red" -> blip
SET_WAYPOINT "docks"
WHILE NOT IS_PLAYER_AT "docks" 14.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip
CLEAR_WAYPOINT

SET_OBJECTIVE "Confront Jules."
WAIT_FOR_TALK "jules"
CINEMATIC_START
CAMERA_SHOT "closeup" "jules" 2500
MUSIC_CUE "sorrow"
SHOW_DIALOGUE "s2.jules_confession"
MUSIC_CUE "hope"
SET_WEATHER "clear"
CAMERA_SHOT "skyline" "city" 3000
SHOW_DIALOGUE "s2.kai_done"
CINEMATIC_END
MISSION_COMPLETE
SCRIPT_END
