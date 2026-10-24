; =====================================================================
; Season 3, Mission 2: "Skimmer Run"
; Card fraud is spiking downtown. Black Lotus planted skimmers on ATMs.
; Teaches: ATM skimmers and shimmers, tamper checks, contactless payments.
; Gameplay: timed run across downtown, an armed courier tries to stop you.
; =====================================================================
SCRIPT_START s3_02_skimmers

LOCAL found = FALSE
LOCAL courier = 0
LOCAL tries = 0

START_THREAD watchdog

CINEMATIC_START
MUSIC_CUE "tension"
CAMERA_SHOT "establish" "soc" 3000
SHOW_TITLE "Skimmer Run" "Downtown Cyber District" 3000
SHOW_DIALOGUE "s3.dex_brief"
CAMERA_SHOT "flyover" "bank" 3000
CINEMATIC_END

GIVE_WEAPON "pistol" 48
GIVE_WEAPON "armor" 0
SHOW_DIALOGUE "s3.s3e2_howto"

run:
MUSIC_CUE "action"
SET_OBJECTIVE "Find and pull the skimmers off six downtown ATMs before the courier collects the card data."
START_THREAD courierThread
COLLECT_START "skimmers" 210 -> found
IF NOT found
    SET tries = tries + 1
    IF tries >= 3
        MISSION_FAILED "The courier collected the stolen card data."
    END_IF
    PRINT_HELP "Time's up on that batch. Dex re-flagged the remaining ATMs: run it again."
    GOTO run
END_IF

MUSIC_CUE "triumph"
SLOW_MOTION 0.5 1000
CINEMATIC_START
SHOW_DIALOGUE "s3.s3e2_skimmer"
CAMERA_SHOT "establish" "bank" 2500
SHOW_DIALOGUE "s3.dex_done"
CINEMATIC_END
MUSIC_CUE "none"
MISSION_COMPLETE
SCRIPT_END

courierThread:
WAIT 25000
LOCAL px = 0.0
LOCAL pz = 0.0
GET_PLAYER_X -> px
GET_PLAYER_Z -> pz
SET px = px + 22.0
SPAWN_ENEMY "courier" px pz 3.14 -> courier
SET_ENEMY_TARGET courier
PRINT_HELP "An armed Black Lotus courier is coming for the skimmers. Take cover (tap Q near a wall) and stop him."
END_THREAD

watchdog:
WHILE TRUE
    WAIT 500
    IF IS_PLAYER_DEAD
        MISSION_FAILED "You were hospitalized."
    END_IF
END_WHILE
