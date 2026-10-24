; =====================================================================
; Season 3, Mission 1: "Tailgate"
; Someone cloned an employee badge and slipped into Palmetto Bank behind
; real staff. Teaches: tailgating, RFID badge cloning, CCTV review.
; Gameplay: CCTV review (cyber challenge), foot chase, stun-gun takedown.
; =====================================================================
SCRIPT_START s3_01_tailgate

LOCAL passed = FALSE
LOCAL runner = 0
LOCAL blip = 0
LOCAL caught = FALSE

START_THREAD watchdog

CINEMATIC_START
MUSIC_CUE "tension"
CAMERA_SHOT "establish" "bank" 3500
SHOW_TITLE "Season 3: Physical Threats" "Tailgate" 3200
SHOW_DIALOGUE "s3.marisol_brief"
CAMERA_SHOT "closeup" "marisol" 2500
CINEMATIC_END

GIVE_WEAPON "taser" 8
PRINT_HELP "Marisol handed you a stun gun. Hold right mouse to aim, left mouse to fire. Non-lethal: perfect for a clean arrest."

cctv:
MUSIC_CUE "stealth"
SET_OBJECTIVE "Review the lobby CCTV at the bank help desk: who followed staff through the secure door?"
START_CHALLENGE "social-1" "bank-terminal" -> passed
IF NOT passed
    PRINT_HELP "The footage is still a blur of faces. Check the feedback, then try the help desk again."
    GOTO cctv
END_IF
SHOW_DIALOGUE "s3.s3e1_spotted"

chase:
MUSIC_CUE "chase"
SPAWN_ENEMY "intruder" 62.0 -92.0 1.57 -> runner
ADD_BLIP_FOR_HANDLE runner "red" -> blip
SET_ENEMY_TARGET runner
SET_OBJECTIVE "Chase the tailgater on foot and drop him with the stun gun. Don't kill him: we need him talking."
ARREST_TARGET runner -> caught
REMOVE_BLIP blip
IF NOT caught
    DESTROY_ENTITY runner
    PRINT_HELP "He's gone. Lobby cameras caught him doubling back toward the bank: get after him."
    GOTO chase
END_IF
SLOW_MOTION 0.4 1200
PLAY_SFX "good"

CINEMATIC_START
MUSIC_CUE "triumph"
SHOW_DIALOGUE "s3.s3e1_badge"
CAMERA_SHOT "establish" "bank" 2500
SHOW_DIALOGUE "s3.marisol_done"
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
