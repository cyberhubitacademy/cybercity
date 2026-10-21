; =====================================================================
; Mission 8 — "The Flamingo's Cipher"
; Priya intercepted a Pink Tide message. Peel the layers, then check the
; meeting place it reveals.
; =====================================================================
SCRIPT_START m08_cipher

LOCAL blip = 0
LOCAL passed = FALSE

SET_OBJECTIVE "Visit Priya's crypto rig at the Byte Bazaar."
ADD_BLIP "market" "pink" -> blip
SET_WAYPOINT "market"

WHILE NOT IS_PLAYER_AT "market" 14.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
WAIT_FOR_TALK "priya"
SHOW_DIALOGUE "m08.priya_brief"

decode:
SET_OBJECTIVE "Decode the intercepted message on the crypto rig."
START_CHALLENGE "crypto-1" "market-terminal" -> passed
IF NOT passed
    PRINT_HELP "Remember: Base64 is encoding, not encryption. Decode it first, then find the Caesar shift."
    GOTO decode
END_IF

SHOW_DIALOGUE "m08.priya_decoded"
SET_OBJECTIVE "Check out the meeting spot on Starlight Pier."
ADD_BLIP "pier" "yellow" -> blip
SET_WAYPOINT "pier"

WHILE NOT IS_PLAYER_AT "pier" 16.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
SHOW_DIALOGUE "m08.pier_clue"
SET_OBJECTIVE "Report to Max at Sunset Shield HQ."
SET_WAYPOINT "hq"

WHILE NOT IS_PLAYER_AT "hq" 10.0
    WAIT 250
END_WHILE

CLEAR_WAYPOINT
WAIT_FOR_TALK "max"
SHOW_DIALOGUE "m08.max_target"
MISSION_COMPLETE
SCRIPT_END
