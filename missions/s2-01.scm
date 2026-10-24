; =====================================================================
; Season 2, Mission 1: "Ghost in the Inbox"
; Six months later. A silent intruder in Sunset Shield's own mail server.
; Teaches: threat hunting, detection engineering, MITRE ATT&CK.
; =====================================================================
SCRIPT_START s2_01_ghost

LOCAL passed = FALSE
LOCAL blip = 0

CINEMATIC_START
SET_HOUR 19.5
SET_WEATHER "clear"
MUSIC_CUE "calm"
CAMERA_SHOT "skyline" "city" 4000
SHOW_TITLE "Season 2: Black Lotus" "Ghost in the Inbox" 3500
SHOW_DIALOGUE "s2.s2e1_open"
CAMERA_SHOT "establish" "hq" 3000
SHOW_DIALOGUE "s2.max_brief"
CINEMATIC_END

MUSIC_CUE "stealth"
SET_OBJECTIVE "Go to the War Room inside Sunset Shield HQ."
PRINT_HELP "The War Room is inside the HQ lobby on Ocean Drive. Follow the marker."
ADD_BLIP "warroom" "cyan" -> blip
SET_WAYPOINT "warroom"
WHILE NOT IS_PLAYER_AT "warroom" 8.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip
CLEAR_WAYPOINT

SET_OBJECTIVE "Talk to NOVA."
WAIT_FOR_TALK "nova"
SHOW_DIALOGUE "s2.nova_reunion"

MUSIC_CUE "tension"
hunt:
SET_OBJECTIVE "Hunt the intruder: build detection rules at the War Room table."
START_CHALLENGE "detection-1" "warroom-terminal" -> passed
IF NOT passed
    PRINT_HELP "The ghost is still hiding. Tune your rules using the feedback, then use the War Room table again."
    GOTO hunt
END_IF

CINEMATIC_START
MUSIC_CUE "villain"
PLAY_SFX "alert"
SCREEN_SHAKE 0.3
SHOW_DIALOGUE "s2.s2e1_card"
CAMERA_SHOT "closeup" "max" 2500
SHOW_DIALOGUE "s2.max_done"
CAMERA_SHOT "skyline" "city" 3000
CINEMATIC_END
MISSION_COMPLETE
SCRIPT_END
