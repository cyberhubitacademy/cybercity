; Sample mission used in docs/bytecode_format.md.
SCRIPT_START getaway

LOCAL playerDead = FALSE

WAIT 1000
IS_PLAYER_DEAD -> playerDead

IF playerDead
    MISSION_FAILED "Rico was hospitalized."
END_IF

0300: SPAWN_CAR "stinger" 100.0 -20.0 1.57 -> getawayCar
PRINT_MESSAGE "Get in the car!" 2000
MISSION_COMPLETE
SCRIPT_END
