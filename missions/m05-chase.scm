; =====================================================================
; Mission 5 — "Hot Pursuit"
; The Pink Tide van was spotted near the Tech Market. Tail it, plant a
; tracker, and don't lose it. A watchdog thread fails the mission if
; Rico gets hospitalized during the chase.
; =====================================================================
SCRIPT_START m05_chase

LOCAL van = 0
LOCAL vanBlip = 0
LOCAL tagged = FALSE

SHOW_DIALOGUE "m05.max_brief"
SET_OBJECTIVE "Get a vehicle."
PRINT_HELP "Any parked car will do. Walk up to one and press E (or F)."

WHILE NOT IS_PLAYER_IN_ANY_VEHICLE
    WAIT 250
END_WHILE

0300: SPAWN_CAR "van" -38.0 -60.0 0.0 -> van
SET_VEHICLE_ROUTE van "pinktide_loop"
ADD_BLIP_FOR_HANDLE van "red" -> vanBlip
START_THREAD watchdog

PRINT_MESSAGE "The Pink Tide van is on the move!" 3000
SET_OBJECTIVE "Tail the van. Stay close to plant the tracker."
CHASE_START van 6 16.0 120 -> tagged

REMOVE_BLIP vanBlip
IF NOT tagged
    MISSION_FAILED "The van got away."
END_IF

DESTROY_ENTITY van
PRINT_MESSAGE "Tracker planted!" 2500
SHOW_DIALOGUE "m05.tracker_planted"
SET_OBJECTIVE "Return to Sunset Shield HQ."
SET_WAYPOINT "hq"

WHILE NOT IS_PLAYER_AT "hq" 10.0
    WAIT 250
END_WHILE

CLEAR_WAYPOINT
SET_OBJECTIVE "Debrief with Max."
WAIT_FOR_TALK "max"
SHOW_DIALOGUE "m05.max_debrief"
MISSION_COMPLETE
SCRIPT_END

; ---- watchdog thread: runs alongside the main thread ----
watchdog:
WHILE TRUE
    WAIT 500
    IF IS_PLAYER_DEAD
        MISSION_FAILED "You were hospitalized."
    END_IF
END_WHILE
