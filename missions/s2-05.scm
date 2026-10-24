; =====================================================================
; Season 2, Mission 5: "Cloud Burst"
; A public bucket at Harbor Cloud, and Jules is acting strange.
; Teaches: shared responsibility, IAM least privilege, key rotation, logging.
; =====================================================================
SCRIPT_START s2_05_cloudburst

LOCAL passed = FALSE
LOCAL blip = 0

CINEMATIC_START
SET_HOUR 9.0
MUSIC_CUE "calm"
CAMERA_SHOT "establish" "docks" 3000
SHOW_TITLE "Cloud Burst" "Harbor Cloud" 3000
CAMERA_SHOT "closeup" "jules" 2500
CINEMATIC_END

MUSIC_CUE "stealth"
lock:
SET_OBJECTIVE "Lock down Harbor Cloud from the edge node on the docks."
START_CHALLENGE "cloud-1" "docks-terminal" -> passed
IF NOT passed
    PRINT_HELP "Something is still exposed. Check the feedback, then use the edge node again."
    GOTO lock
END_IF

MUSIC_CUE "tension"
SHOW_DIALOGUE "s2.s2e5_key"
PLAY_SFX "beep"
SHOW_DIALOGUE "s2.s2e5_tip"

SET_OBJECTIVE "Meet Tito at the Harbor Cloud data center."
ADD_BLIP "datacenter" "cyan" -> blip
SET_WAYPOINT "datacenter"
WHILE NOT IS_PLAYER_AT "datacenter" 12.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip
CLEAR_WAYPOINT

SET_OBJECTIVE "Talk to Tito."
WAIT_FOR_TALK "tito"
SHOW_DIALOGUE "s2.tito_logs"

CINEMATIC_START
MUSIC_CUE "sorrow"
SET_HOUR 18.5
CAMERA_SHOT "establish" "docks" 3000
SHOW_DIALOGUE "s2.s2e5_doubt"
SHOW_DIALOGUE "s2.rico_done"
CINEMATIC_END
MISSION_COMPLETE
SCRIPT_END
