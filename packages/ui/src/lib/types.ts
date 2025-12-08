
export type MqttMessageEvent = {
    topic: string;
    payload: string;
    receivedAt: string;
};

export type CommandPacket = {
    entity: string;
    entityId: string;
    command: string;
    value: any;
    packet: string;
    timestamp: string;
};

export type StateChangeEvent = {
    entityId: string;
    topic: string;
    payload: string;
    state: Record<string, unknown>;
    timestamp: string;
};

export type FrontendSettings = {
    toast: {
        stateChange: boolean;
        command: boolean;
    };
};

export type BridgeStatus = 'idle' | 'starting' | 'started' | 'stopped' | 'error';

export type CommandInfo = {
    entityId: string;
    entityName: string;
    entityType: string;
    commandName: string;
    displayName: string;
    inputType?: 'number' | 'text';
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
};

export type BridgeInfo = {
    configFile: string;
    serialPath: string;
    baudRate: number;
    mqttUrl: string;
    status: BridgeStatus;
    error?: string | null;
    topic: string;
};

export type RawPacketWithInterval = {
    topic: string;
    payload: string;
    receivedAt: string;
    interval: number | null;
};

export type PacketStats = {
    packetAvg: number;
    packetStdDev: number;
    idleAvg: number;
    idleStdDev: number;
    idleOccurrenceAvg: number;
    idleOccurrenceStdDev: number;
    sampleSize: number;
};

export type UnifiedEntity = {
    id: string;
    displayName: string;
    type?: string;
    statePayload?: string;
    commands: CommandInfo[];
    isStatusDevice: boolean;
};

export type ParsedPayloadEntry = {
    key: string;
    value: string;
};

export type ParsedPacket = {
    entityId: string;
    packet: string; // hex string
    state: any;
    timestamp: string;
};

export type ToastMessage = {
    id: string;
    type: 'state' | 'command';
    title: string;
    message: string;
    timestamp: string;
};
