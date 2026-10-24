; =====================================================================
; Season 2, Mission 2: "Code Red at Neon Bay General"
; Ransomware hits the hospital on a rainy night. Lives are at stake.
; Teaches: incident response, offline backups, segmentation.
; =====================================================================
SCRIPT_START s2_02_codered

LOCAL passed = FALSE
LOCAL blip = 0

CINEMATIC_START
SET_HOUR 22.5
SET_WEATHER "rain"
MUSIC_CUE "tension"
CAMERA_SHOT "establish" "hospital" 3500
SHOW_TITLE "Code Red" "Neon Bay General" 3000
SHOW_DIALOGUE "s2.s2e2_ward"
CAMERA_SHOT "orbit" "hospital" 3000
CINEMATIC_END

MUSIC_CUE "action"
SET_OBJECTIVE "Get to Neon Bay General. Every minute counts."
PRINT_HELP "Press E next to any parked car to drive. The hospital is in the west of the city: follow the red marker."
ADD_BLIP "hospital" "red" -> blip
SET_WAYPOINT "hospital"
SET_TIMER 180
WHILE NOT IS_PLAYER_AT "hospital" 14.0
    WAIT 250
END_WHILE
CLEAR_TIMER
REMOVE_BLIP blip
CLEAR_WAYPOINT

SET_OBJECTIVE "Talk to Dr. Amara Singh."
WAIT_FOR_TALK "amara"
SHOW_DIALOGUE "s2.amara_ward"

MUSIC_CUE "tension"
respond:
SET_OBJECTIVE "Run the incident response from the hospital IT room."
START_CHALLENGE "incident-1" "hospital-terminal" -> passed
IF NOT passed
    PRINT_HELP "Patients are waiting, but rushing makes it worse. Read the playbook feedback and try again."
    GOTO respond
END_IF

CINEMATIC_START
MUSIC_CUE "sorrow"
CAMERA_SHOT "closeup" "amara" 3000
SHOW_DIALOGUE "s2.amara_done"
MUSIC_CUE "hope"
SET_WEATHER "clear"
CAMERA_SHOT "orbit" "hospital" 3500
MUSIC_CUE "villain"
SHOW_DIALOGUE "s2.s2e2_lotus"
CINEMATIC_END
MISSION_COMPLETE
SCRIPT_END
