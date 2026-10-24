; =====================================================================
; Season 3, Mission 5: "The Getaway"
; Black Lotus hijacked the courier van carrying the power plant's offsite
; backup tapes. Teaches: backup tape encryption, chain of custody, keys
; stored apart from the media, secure transport.
; Gameplay: vehicle chase, shoot out the tires, firefight, lose the cops,
; verify the tapes.
; =====================================================================
SCRIPT_START s3_05_getaway

LOCAL van = 0
LOCAL vanBlip = 0
LOCAL stopped = FALSE
LOCAL crew = 0
LOCAL crew2 = 0
LOCAL passed = FALSE
LOCAL px = 0.0
LOCAL pz = 0.0

START_THREAD watchdog

CINEMATIC_START
MUSIC_CUE "tension"
CAMERA_SHOT "establish" "powerplant" 3000
SHOW_TITLE "The Getaway" "Neon Bay Power Station" 3000
SHOW_DIALOGUE "s3.kai_brief"
CAMERA_SHOT "closeup" "kai" 2500
CINEMATIC_END

GIVE_WEAPON "smg" 120
PRINT_HELP "Kai's security chief lent you an SMG. In a car, hold right mouse to aim out of the side window."
SET_OBJECTIVE "Get a vehicle."
WHILE NOT IS_PLAYER_IN_ANY_VEHICLE
    WAIT 250
END_WHILE

chase:
SPAWN_CAR "van" -76.6 -30.0 3.14 -> van
SET_VEHICLE_ROUTE van "pinktide_loop"
ADD_BLIP_FOR_HANDLE van "red" -> vanBlip
MUSIC_CUE "chase"
CAMERA_FOLLOW van 2500
SET_OBJECTIVE "Catch the courier van and shoot out its tires (aim low at the wheels)."
WAIT_VEHICLE_DISABLED van 180 -> stopped
REMOVE_BLIP vanBlip
IF NOT stopped
    DESTROY_ENTITY van
    PRINT_HELP "The van got away. Traffic cameras picked it up near the market again: back on it."
    GOTO chase
END_IF

MUSIC_CUE "action"
SHOW_DIALOGUE "s3.s3e5_stopped"
GET_PLAYER_X -> px
GET_PLAYER_Z -> pz
SET px = px + 10.0
SPAWN_ENEMY "lotus" px pz 3.14 -> crew
SET_ENEMY_TARGET crew
SET px = px + 3.0
SPAWN_ENEMY "lotus_heavy" px pz 3.14 -> crew2
SET_ENEMY_TARGET crew2
SET_OBJECTIVE "The van crew is shooting back. Take them down."
WAIT_ENEMIES_CLEARED crew
WAIT_ENEMIES_CLEARED crew2
WAIT 1500

SET_OBJECTIVE "That firefight drew the police. Lose them before you hand the tapes back."
WAIT_WANTED_CLEARED
DESTROY_ENTITY van

verify:
MUSIC_CUE "stealth"
SET_OBJECTIVE "Prove the tapes are safe: verify their encryption at the power station control room."
START_CHALLENGE "crypto-1" "grid-terminal" -> passed
IF NOT passed
    PRINT_HELP "Not verified yet. Check the feedback and try the control room again."
    GOTO verify
END_IF

CINEMATIC_START
MUSIC_CUE "triumph"
SHOW_DIALOGUE "s3.s3e5_tapes"
CAMERA_SHOT "establish" "powerplant" 2500
SHOW_DIALOGUE "s3.kai_done"
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
