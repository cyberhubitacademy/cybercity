; =====================================================================
; Season 3, Mission 4: "Dumpster Diver"
; Someone is going through Sunset Shield's trash, and the Neon 24/7 owner
; wants her store's robbery procedure tested.
; Teaches: shredding and secure disposal, clean desk, physical pentest
; scope and the signed authorization letter.
; Gameplay: catch the diver, rotate leaked credentials, authorized robbery
; drill (aim at the clerk), deal with the police response.
; =====================================================================
SCRIPT_START s3_04_dumpster

LOCAL diver = 0
LOCAL blip = 0
LOCAL caught = FALSE
LOCAL passed = FALSE
LOCAL robbed = FALSE

START_THREAD watchdog

CINEMATIC_START
MUSIC_CUE "tension"
CAMERA_SHOT "establish" "hq" 3000
SHOW_TITLE "Dumpster Diver" "Sunset Shield HQ" 3000
SHOW_DIALOGUE "s3.max_brief"
CINEMATIC_END

diver:
MUSIC_CUE "chase"
SPAWN_ENEMY "intruder" 150.0 -30.0 0.0 -> diver
ADD_BLIP_FOR_HANDLE diver "red" -> blip
SET_ENEMY_TARGET diver
SET_OBJECTIVE "A dumpster diver is running off with our printouts. Catch him: punch, tackle or tase. No guns."
ARREST_TARGET diver -> caught
REMOVE_BLIP blip
IF NOT caught
    DESTROY_ENTITY diver
    PRINT_HELP "He slipped away down an alley. NOVA has him on a street camera again."
    GOTO diver
END_IF
SHOW_DIALOGUE "s3.s3e4_trash"

rotate:
MUSIC_CUE "stealth"
SET_OBJECTIVE "The printouts had VPN passwords on them. Rotate the leaked credentials in the Cyber Lab."
START_CHALLENGE "password-1" "hq-lab" -> passed
IF NOT passed
    PRINT_HELP "Some leaked passwords still work. Try the Cyber Lab again."
    GOTO rotate
END_IF
SHOW_DIALOGUE "s3.s3e4_pentest"

drill:
MUSIC_CUE "tension"
GIVE_WEAPON "pistol" 12
SET_OBJECTIVE "Authorized drill: aim at the Neon 24/7 clerk on Ocean Drive and test the robbery procedure."
PRINT_HELP "This is an authorized physical pentest. The owner signed the letter. Scope: the register and the silent alarm. Nothing else."
START_ROBBERY "beach" -> robbed
IF NOT robbed
    PRINT_HELP "The drill fell apart. Walk back in and run it again by the book."
    GOTO drill
END_IF

MUSIC_CUE "chase"
SHOW_DIALOGUE "s3.s3e4_cops"
SET_WANTED 2
SET_OBJECTIVE "The silent alarm worked. Patrol cars are on the way: lose them, or stop and show your letter."
WAIT 8000
CLEAR_WANTED
SHOW_DIALOGUE "s3.s3e4_letter"

CINEMATIC_START
MUSIC_CUE "hope"
CAMERA_SHOT "establish" "hq" 2500
SHOW_DIALOGUE "s3.max_done"
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
