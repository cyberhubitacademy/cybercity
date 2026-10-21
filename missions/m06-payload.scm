; =====================================================================
; Mission 6 — "The Hidden Payload"
; The tracker led back to Harbor Cloud: a workstation is infected.
; Triage it in the sandbox and contain it.
; =====================================================================
SCRIPT_START m06_payload

LOCAL blip = 0
LOCAL passed = FALSE

SET_OBJECTIVE "Meet Tito at the Harbor Cloud data center."
ADD_BLIP "datacenter" "cyan" -> blip
SET_WAYPOINT "datacenter"

WHILE NOT IS_PLAYER_AT "datacenter" 12.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
WAIT_FOR_TALK "tito"
SHOW_DIALOGUE "m06.tito_brief"

triage:
SET_OBJECTIVE "Triage the infected workstation at the data center console."
START_CHALLENGE "malware-1" "dc-terminal" -> passed
IF NOT passed
    PRINT_HELP "Compare file hashes with the threat-intel list and follow the process tree from Outlook down."
    GOTO triage
END_IF

SHOW_DIALOGUE "m06.tito_done"
MISSION_COMPLETE
SCRIPT_END
