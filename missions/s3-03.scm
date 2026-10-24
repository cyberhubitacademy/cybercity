; =====================================================================
; Season 3, Mission 3: "Server Room Siege"
; An armed Black Lotus crew storms the Harbor Cloud data center to plant a
; rogue device on the core switch and exfiltrate customer data.
; Teaches: mantraps, layered physical access, server room access logs.
; Gameplay: cover shooting through two waves, then stop the exfil.
; =====================================================================
SCRIPT_START s3_03_siege

LOCAL wave = 0
LOCAL passed = FALSE
LOCAL blip = 0

START_THREAD watchdog

CINEMATIC_START
MUSIC_CUE "villain"
CAMERA_SHOT "establish" "datacenter" 3500
SHOW_TITLE "Server Room Siege" "Harbor Cloud Data Center" 3000
SHOW_DIALOGUE "s3.tito_brief"
CAMERA_SHOT "closeup" "tito" 2500
CINEMATIC_END

GIVE_WEAPON "pistol" 60
GIVE_WEAPON "armor" 0
SPAWN_PICKUP "rifle" 44.0 112.0
SPAWN_PICKUP "health" 56.0 112.0
PRINT_HELP "Tito left a rifle and a med kit by the loading dock. Tap Q next to cover, aim to pop out, Z for Focus slow-motion."

SET_OBJECTIVE "Get to the Harbor Cloud data center."
ADD_BLIP "datacenter" "red" -> blip
WHILE NOT IS_PLAYER_AT "datacenter" 40.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip

MUSIC_CUE "action"
SET_OBJECTIVE "Fight through the Black Lotus crew at the loading dock."
SPAWN_ENEMY_GROUP "lotus" "datacenter" 4 -> wave
SET_ENEMY_TARGET wave
WAIT_ENEMIES_CLEARED wave
SHOW_DIALOGUE "s3.s3e3_mantrap"

SET_OBJECTIVE "Reinforcements! Hold the mantrap entrance."
SPAWN_ENEMY_GROUP "lotus_heavy" "datacenter" 2 -> wave
SET_ENEMY_TARGET wave
WAIT_ENEMIES_CLEARED wave
SPAWN_ENEMY_GROUP "lotus" "datacenter" 3 -> wave
SET_ENEMY_TARGET wave
WAIT_ENEMIES_CLEARED wave
PLAY_SFX "good"

exfil:
MUSIC_CUE "tension"
SET_OBJECTIVE "The rogue device is still exfiltrating. Kill the exfil at the data center console."
START_CHALLENGE "cloud-1" "dc-terminal" -> passed
IF NOT passed
    PRINT_HELP "Data is still leaving the building. Use the feedback and try the console again."
    GOTO exfil
END_IF

CINEMATIC_START
MUSIC_CUE "triumph"
SHOW_DIALOGUE "s3.s3e3_logs"
CAMERA_SHOT "establish" "datacenter" 2500
SHOW_DIALOGUE "s3.tito_done"
CINEMATIC_END
MUSIC_CUE "none"
MISSION_COMPLETE
SCRIPT_END

watchdog:
WHILE TRUE
    WAIT 500
    IF IS_PLAYER_DEAD
        MISSION_FAILED "You were hospitalized."
    END_IF
END_WHILE
