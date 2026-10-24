; =====================================================================
; Season 2, Mission 6: "Poisoned Package"
; A poisoned dependency in Sunset Shield's own pipeline; NOVA nearly obeys
; a prompt injection hidden in a README.
; Teaches: supply-chain attacks, SBOMs, signed builds, prompt injection.
; =====================================================================
SCRIPT_START s2_06_package

LOCAL passed = FALSE
LOCAL blip = 0

CINEMATIC_START
SET_HOUR 21.0
MUSIC_CUE "tension"
CAMERA_SHOT "establish" "hq" 3000
SHOW_TITLE "Poisoned Package" "Sunset Shield HQ" 3000
CINEMATIC_END

SET_OBJECTIVE "Go to the War Room."
ADD_BLIP "warroom" "cyan" -> blip
SET_WAYPOINT "warroom"
WHILE NOT IS_PLAYER_AT "warroom" 8.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip
CLEAR_WAYPOINT

SET_OBJECTIVE "Talk to NOVA."
WAIT_FOR_TALK "nova"
CINEMATIC_START
CAMERA_SHOT "closeup" "nova" 2500
SHOW_DIALOGUE "s2.nova_confession"
CINEMATIC_END

MUSIC_CUE "stealth"
hunt:
SET_OBJECTIVE "Hunt the poisoned dependency in the Cyber Lab."
START_CHALLENGE "supplychain-1" "hq-lab" -> passed
IF NOT passed
    PRINT_HELP "The poisoned package is still in the build. Compare names, hashes and signatures, then try the Cyber Lab again."
    GOTO hunt
END_IF

CINEMATIC_START
MUSIC_CUE "sorrow"
CAMERA_SHOT "closeup" "max" 3000
SHOW_DIALOGUE "s2.s2e6_max"
MUSIC_CUE "hope"
SHOW_DIALOGUE "s2.max_done"
CINEMATIC_END
MISSION_COMPLETE
SCRIPT_END
