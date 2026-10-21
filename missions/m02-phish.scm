; =====================================================================
; Mission 2 — "Catch of the Day"
; Carla's café inbox is full of suspicious mail. Find the phish.
; =====================================================================
SCRIPT_START m02_phish

LOCAL blip = 0
LOCAL passed = FALSE
LOCAL attempts = 0

SHOW_DIALOGUE "m02.max_brief"
SET_OBJECTIVE "Go to Coral Café on Ocean Drive."
ADD_BLIP "cafe" "cyan" -> blip
SET_WAYPOINT "cafe"

WHILE NOT IS_PLAYER_AT "cafe" 12.0
    WAIT 250
END_WHILE

REMOVE_BLIP blip
CLEAR_WAYPOINT
SET_OBJECTIVE "Talk to Carla Reyes."
WAIT_FOR_TALK "carla"
SHOW_DIALOGUE "m02.carla_intro"

inbox:
SET_OBJECTIVE "Use the café back-office PC to inspect Carla's inbox."
START_CHALLENGE "phishing-1" "cafe-terminal" -> passed
SET attempts = attempts + 1
IF NOT passed
    PRINT_HELP "Not quite. Read the feedback, then use the PC again. Every attempt teaches you something."
    GOTO inbox
END_IF

SHOW_DIALOGUE "m02.carla_done"
MISSION_COMPLETE
SCRIPT_END
