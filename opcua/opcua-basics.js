/*
 Copyright 2016 Klaus Landsdorf

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

"use strict";

module.exports.collectAlarmFields = function (field, key, value, msg) {

    switch (field) {
        // Common fields
        case "EventId":
            msg.EventId = value;
            break;
        case "EventType":
            msg.EventType = value;
            break;
        case "SourceNode":
            msg.SourceNode = value;
            break;
        case "SourceName":
            msg.SourceName = value;
            break;
        case "Time":
            msg.Time = value;
            break;
        case "ReceiveTime":
            msg.ReceiveTime = value;
            break;
        case "Message":
            msg.Message = value.text;
            break;
        case "Severity":
            msg.Severity = value;
            break;

        // ConditionType
        case "ConditionClassId":
            msg.ConditionClassId = value;
            break;
        case "ConditionClassName":
            msg.ConditionClassNameName = value;
            break;
        case "ConditionName":
            msg.ConditionName = value;
            break;
        case "BranchId":
            msg.BranchId = value;
            break;
        case "Retain":
            msg.Retain = value;
            break;
        case "EnabledState":
            msg.EnabledState = value.text;
            break;
        case "Quality":
            msg.Quality = value;
            break;
        case "LastSeverity":
            msg.LastSeverity = value;
            break;
        case "Comment":
            msg.Comment = value.text;
            break;
        case "ClientUserId":
            msg.ClientUserId = value;
            break;

        // AcknowledgeConditionType
        case "AckedState":
            msg.AckedState = value.text;
            break;
        case "ConfirmedState":
            msg.ConfirmedState = value.text;
            break;

        // AlarmConditionType
        case "ActiveState":
            msg.ActiveState = value.text;
            break;
        case "InputNode":
            msg.InputNode = value;
            break;
        case "SupressedState":
            msg.SupressedState = value.text;
            break;

        // Limits
        case "HighHighLimit":
            msg.HighHighLimit = value;
            break;
        case "HighLimit":
            msg.HighLimit = value;
            break;
        case "LowLimit":
            msg.LowLimit = value;
            break;
        case "LowLowLimit":
            msg.LowLowLimit = value;
            break;
        case "Value":
            msg.Value = value;
            break;
        default:
            msg.error = "unknown collected Alarm field " + field;
            break;
    }

    return msg;
};


module.exports.getBasicEventFields = function () {

    return [
        // Common fields
        "EventId",
        "EventType",
        "SourceNode",
        "SourceName",
        "Time",
        "ReceiveTime",
        "Message",
        "Severity",

        // ConditionType
        "ConditionClassId",
        "ConditionClassName",
        "ConditionName",
        "BranchId",
        "Retain",
        "EnabledState",
        "Quality",
        "LastSeverity",
        "Comment",
        "ClientUserId",

        // AcknowledgeConditionType
        "AckedState",
        "ConfirmedState",

        // AlarmConditionType
        "ActiveState",
        "InputNode",
        "SuppressedState",

        "HighLimit",
        "LowLimit",
        "HighHighLimit",
        "LowLowLimit",

        "Value"
    ];
};


module.exports.getEventSubscribtionParameters = function () {
    return {
        requestedPublishingInterval: 100,
        requestedLifetimeCount: 1000,
        requestedMaxKeepAliveCount: 12,
        maxNotificationsPerPublish: 10,
        publishingEnabled: true,
        priority: 10
    };
};

module.exports.getSubscriptionParameters = function (time) {
    return {
        requestedPublishingInterval: time,
        requestedLifetimeCount: 10,
        requestedMaxKeepAliveCount: 2,
        maxNotificationsPerPublish: 10,
        publishingEnabled: true,
        priority: 10
    }
};

module.exports.buildBrowseMessage = function (topic) {
    return {
        "topic": topic,
        "nodeId": "",
        "browseName": "",
        "nodeClassType": "",
        "typeDefinition": "",
        "payload": ""
    };
};

module.exports.toInt32 = function (x) {
    var uint16 = x;

    if (uint16 >= Math.pow(2, 15)) {
        uint16 = x - Math.pow(2, 16);
        return uint16;
    }
    else {
        return uint16;
    }
};

module.exports.get_node_status = function (statusValue) {

    var fillValue = "red";
    var shapeValue = "dot";

    switch (statusValue) {

        case "create client":
        case "connecting":
        case "connected":
        case "initialized":
        case "keepalive":
            fillValue = "green";
            shapeValue = "ring";
            break;

        case "active":
        case "active reading":
        case "active writing":
        case "active subscribing":
        case "active subscribed":
        case "active browsing":
        case "active alarm":
        case "active event":
        case "session active":
        case "subscribed":
        case "browse done":
        case "changed":
            fillValue = "green";
            shapeValue = "dot";
            break;

        case "disconnected":
        case "terminated":
            fillValue = "red";
            shapeValue = "ring";
            break;

        default:
            if (!statusValue) {
                fillValue = "blue";
                statusValue = "waiting ...";
            }
            break;
    }

    return {fill: fillValue, shape: shapeValue, status: statusValue};
};


module.exports.build_new_variant = function (opcua, data) {

    var nValue = new opcua.Variant({dataType: opcua.DataType.Float, value: 0.0});

    switch (data) {
        case"Float":
            nValue = new opcua.Variant({dataType: opcua.DataType.Float, value: parseFloat(data)});
            break;
        case"Double":
            nValue = new opcua.Variant({
                dataType: opcua.DataType.Double,
                value: parseFloat(data)
            });
            break;
        case"UInt16":
            var uint16 = new Uint16Array([data]);
            nValue = new opcua.Variant({dataType: opcua.DataType.UInt16, value: uint16[0]});
            break;
        case"Integer":
            nValue = new opcua.Variant({dataType: opcua.DataType.UInt16, value: parseInt(data)});
            break;
        case"Boolean":
            if (data) {
                nValue = new opcua.Variant({dataType: opcua.DataType.Boolean, value: true})
            }
            else {
                nValue = new opcua.Variant({dataType: opcua.DataType.Boolean, value: false})
            }
            break;
        case"String":
            nValue = new opcua.Variant({dataType: opcua.DataType.String, value: data});
            break;
        default:
            break;
    }

    return nValue;
};
