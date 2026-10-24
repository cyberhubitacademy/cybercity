; =====================================================================
; Season 2, Mission 3: "The Voice of Marisol"
; A deepfake of the bank COO's voice orders an urgent wire.
; Teaches: deepfake fraud, out-of-band verification, prompt injection.
; =====================================================================
SCRIPT_START s2_03_voice

LOCAL passed = FALSE
LOCAL car = 0
LOCAL carBlip = 0
LOCAL tagged = FALSE

CINEMATIC_START
SET_HOUR 16.9
MUSIC_CUE "tension"
CAMERA_SHOT "establish" "bank" 3500
SHOW_TITLE "The Voice of Marisol" "Palmetto Bank" 3000
SHOW_DIALOGUE "s2.s2e3_voice"
CAMERA_SHOT "closeup" "marisol" 2500
CINEMATIC_END

probe:
SET_OBJECTIVE "Investigate the deepfake call at the bank help desk."
START_CHALLENGE "ai-1" "bank-terminal" -> passed
IF NOT passed
    PRINT_HELP "The fake voice still fools the system. Check the feedback for the clues you missed, then try the help desk again."
    GOTO probe
END_IF

MUSIC_CUE "action"
SHOW_DIALOGUE "s2.s2e3_mule"
SET_OBJECTIVE "Get a vehicle."
PRINT_HELP "Any parked car will do. Walk up to one and press E."
WHILE NOT IS_PLAYER_IN_ANY_VEHICLE
    WAIT 250
END_WHILE

tail:
SPAWN_CAR "sedan" -76.6 -30.0 3.14 -> car
SET_VEHICLE_ROUTE car "pinktide_loop"
ADD_BLIP_FOR_HANDLE car "red" -> carBlip
MUSIC_CUE "chase"
CAMERA_FOLLOW car 2500
SET_OBJECTIVE "Tail the money mule's car. Stay close so police can make the stop."
CHASE_START car 5 16.0 120 -> tagged
REMOVE_BLIP carBlip
IF NOT tagged
    DESTROY_ENTITY car
    PRINT_HELP "The courier slipped away. Police spotted the car again near the market: get back on its tail."
    GOTO tail
END_IF
DESTROY_ENTITY car
SLOW_MOTION 0.4 1500
PLAY_SFX "good"

CINEMATIC_START
MUSIC_CUE "triumph"
SHOW_DIALOGUE "s2.s2e3_caught"
CAMERA_SHOT "establish" "bank" 3000
SHOW_DIALOGUE "s2.marisol_done"
CINEMATIC_END
MISSION_COMPLETE
SCRIPT_END
