; =====================================================================
; Season 2, Mission 8: "Lotus Bloom" (finale)
; War room triage, a chase across the city, and a conversation on the pier.
; Teaches: correlation and triage at scale, coordinated disclosure, ethics.
; =====================================================================
SCRIPT_START s2_08_lotusbloom

LOCAL passed = FALSE
LOCAL blip = 0
LOCAL van = 0
LOCAL vanBlip = 0
LOCAL tagged = FALSE

CINEMATIC_START
SET_HOUR 1.5
SET_WEATHER "clear"
MUSIC_CUE "epic"
CAMERA_SHOT "skyline" "city" 3500
SHOW_TITLE "Lotus Bloom" "The Season 2 finale" 3500
CAMERA_SHOT "establish" "hq" 2500
CINEMATIC_END

SET_OBJECTIVE "Go to the War Room."
ADD_BLIP "warroom" "cyan" -> blip
SET_WAYPOINT "warroom"
WHILE NOT IS_PLAYER_AT "warroom" 8.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip
CLEAR_WAYPOINT

CINEMATIC_START
SHOW_DIALOGUE "s2.s2e8_open"
CINEMATIC_END

MUSIC_CUE "action"
triage:
SET_OBJECTIVE "Triage the multi-front attack at the War Room table."
START_CHALLENGE "soc-1" "warroom-terminal" -> passed
IF NOT passed
    PRINT_HELP "Too many fires, not enough focus. Enrich, correlate, then escalate. Try the War Room table again."
    GOTO triage
END_IF

MUSIC_CUE "chase"
SHOW_DIALOGUE "s2.s2e8_run"
SET_OBJECTIVE "Get a vehicle."
WHILE NOT IS_PLAYER_IN_ANY_VEHICLE
    WAIT 250
END_WHILE

pursuit:
SPAWN_CAR "van" -76.6 -30.0 3.14 -> van
SET_VEHICLE_ROUTE van "pinktide_loop"
ADD_BLIP_FOR_HANDLE van "purple" -> vanBlip
CAMERA_FOLLOW van 2500
SET_OBJECTIVE "Tail the Black Lotus van. Stay close!"
CHASE_START van 6 16.0 150 -> tagged
REMOVE_BLIP vanBlip
IF NOT tagged
    DESTROY_ENTITY van
    PRINT_HELP "NOVA lost the van, then found it again near the market. Get back on its tail!"
    GOTO pursuit
END_IF
DESTROY_ENTITY van
SLOW_MOTION 0.4 1500
PLAY_SFX "good"

MUSIC_CUE "tension"
SET_OBJECTIVE "Lotus left the van and walked toward the water. Meet Lotus on Starlight Pier."
ADD_BLIP "pier" "purple" -> blip
SET_WAYPOINT "pier"
WHILE NOT IS_PLAYER_AT "pier" 14.0
    WAIT 250
END_WHILE
REMOVE_BLIP blip
CLEAR_WAYPOINT

CINEMATIC_START
MUSIC_CUE "sorrow"
CAMERA_SHOT "orbit" "pier" 4000
SHOW_DIALOGUE "s2.s2e8_pier"
SHOW_DIALOGUE "s2.s2e8_talk"
MUSIC_CUE "hope"
CAMERA_SHOT "flyover" "pier" 3500
SHOW_DIALOGUE "s2.max_done"
SHOW_DIALOGUE "s2.s2e8_flamingo"
MUSIC_CUE "triumph"
SET_HOUR 6.5
CAMERA_SHOT "skyline" "city" 4000
SHOW_TITLE "One month later" "Neon Bay" 2500
SHOW_DIALOGUE "s2.s2e8_epilogue"
CINEMATIC_END
MISSION_COMPLETE
SCRIPT_END
