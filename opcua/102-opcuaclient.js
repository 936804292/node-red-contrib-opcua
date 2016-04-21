/**

 Copyright 2015 Valmet Automation Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 **/

module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');
    var nodeId = require('node-opcua/lib/datamodel/nodeid');
    var browse_service = require("node-opcua/lib/services/browse_service");
    var async = require("async");
    var treeify = require('treeify');
    var Set = require("collections/set");
	var DataType = opcua.DataType;
	var AttributeIds = opcua.AttributeIds;
	
    function OpcUaClientNode(n) {

        RED.nodes.createNode(this, n);

        this.name = n.name;
        this.action = n.action;
        this.time = n.time;

        var node = this;

        var opcuaEndpoint = RED.nodes.getNode(n.endpoint);

        var items = [];

        var subscription; // only one subscription needed to hold multiple monitored Items
		var event_subscription; // only one subscription needed to hold multiple monitored Items

        var monitoredItems = new Set(null, function (a, b) {
            return a.topicName === b.topicName;
        }, function (object) {
            return object.topicName;
        }); // multiple monitored Items should be registered only once

        function verbose_warn(logMessage) {
            if (RED.settings.verbose) {
                node.warn((node.name) ? node.name + ': ' + logMessage : 'OpcUaClientNode: ' + logMessage);
            }
        }

        function verbose_log(logMessage) {
            if (RED.settings.verbose) {
                node.log(logMessage);
            }
        }

		
		function getBrowseName(session,nodeId,callback) {
			session.read([{ nodeId: nodeId, attributeId: AttributeIds.BrowseName}],function(err,org,readValue) {
				if (!err) {
					if (readValue[0].statusCode === opcua.StatusCodes.Good) {
						var browseName = readValue[0].value.value.name;
						return callback(null,browseName);
					}
				}
				callback(err,"<??>");
			})
		}

		function __dumpEvent(node,session,fields,eventFields,_callback) {

			async.forEachOf(eventFields,function(variant,index,callback) {
				var msg = {};
				if (variant.dataType === DataType.Null) {
					return callback();
				}
				if (variant.dataType === DataType.NodeId)  {

					getBrowseName(session,variant.value,function(err,name){

						if (!err) {
							
							msg.topic = name;
							msg.payload = name + ":" + fields[index] + ":" + variant.dataType.key.toString() + ":"+ name + ":" + variant.value;
							//console.log(name, fields[index]);
							node.send(msg);
							//console.log(w(name,20),w(fields[index],15).yellow,w(variant.dataType.key,10).toString().cyan,name.cyan.bold,"(",w(variant.value,20),")");
						}
						callback();
					});

				} else {
					setImmediate(function() {
						//console.log("",fields[index]);
						msg.payload = "" + fields[index] + ":" + variant.dataType.key.toString() + ":" + variant.value;
						//console.log(w("",20),w(fields[index],15).yellow,w(variant.dataType.key,10).toString().cyan,variant.value);
						callback();
					})
				}
			},_callback);
		}

		var q = new async.queue(function(task,callback){
			__dumpEvent(task.node, task.session,task.fields,task.eventFields,callback);
		});

		function dumpEvent(node,session,fields,eventFields,_callback) {
			q.push({
				node: node, session: session, fields:fields, eventFields: eventFields, _callback: _callback
			});
		}

        if (node.client == null) {
            verbose_warn("create Client ...");
            node.client = new opcua.OPCUAClient();
            node.items = items;
            set_node_status_to("create client");
        }

        function set_node_status_to(statusValue) {

            verbose_log("Client status: " + statusValue);

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
                case "session active":
                case "subscribed":
                case "browse done":
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

            node.status({fill: fillValue, shape: shapeValue, text: statusValue});
        }

        async.series([
            // First connect to server´s endpoint
            function (callback) {
                verbose_log("async series - connecting ", opcuaEndpoint.endpoint);
                try {
                    set_node_status_to("connecting");
                    node.client.connect(opcuaEndpoint.endpoint, callback);
                } catch (err) {
                    callback(err);
                }
            },
            function (callback) {
                verbose_log("async series - create session ...");
                try {
                    node.client.createSession(function (err, session) {
                        if (!err) {
                            node.session = session;
                            node.session.timeout = 10000;
                            verbose_log("session active");
                            set_node_status_to("session active");
                            callback();
                        }
                        else {
                            set_node_status_to("session error");
                            callback(err);
                        }
                    });
                } catch (err) {
                    callback(err);
                }
            }
        ], function (err) {
            if (err) {
                node.error(node.name + " OPC UA connection error: " + err.message);
                verbose_log(err);
                set_node_status_to("connection error");
                node.session = null;
                node.client = null;
            }
        });

        function make_subscription(callback, msg) {

            var newSubscription = null;

            if (!node.session) {
                verbose_log("Subscription without session");
                return newSubscription;
            }

            newSubscription = new opcua.ClientSubscription(node.session, {

                requestedPublishingInterval: node.time,
                requestedLifetimeCount: 10,
                requestedMaxKeepAliveCount: 2,
                maxNotificationsPerPublish: 10,
                publishingEnabled: true,
                priority: 10
            });

            newSubscription.on("initialized", function () {
                verbose_log("Subscription initialized");
                set_node_status_to("initialized");
            });

            newSubscription.on("started", function () {
                verbose_log("Subscription subscribed ID: " + newSubscription.subscriptionId);
                set_node_status_to("subscribed");
                callback(newSubscription, msg);
            });

            newSubscription.on("keepalive", function () {
                verbose_log("Subscription keepalive ID: " + newSubscription.subscriptionId);
                set_node_status_to("keepalive");
            });

            newSubscription.on("terminated", function () {
                verbose_log("Subscription terminated ID: " + newSubscription.subscriptionId);
                set_node_status_to("terminated");
                subscription = null;
                monitoredItems.clear();
            });

            return newSubscription;
        }

        function ToInt32(x) {
            var uint16 = x;

            if (uint16 >= Math.pow(2, 15)) {
                uint16 = x - Math.pow(2, 16);
                return uint16;
            }
            else {
                return uint16;
            }
        }

        function build_new_variant(msg) {

            var nValue = new opcua.Variant({dataType: opcua.DataType.Float, value: 0.0});

            switch (msg.datatype) {
                case"Float":
                    nValue = new opcua.Variant({dataType: opcua.DataType.Float, value: parseFloat(msg.payload)});
                    break;
                case"Double":
                    nValue = new opcua.Variant({
                        dataType: opcua.DataType.Double,
                        value: parseFloat(msg.payload)
                    });
                    break;
                case"UInt16":
                    var uint16 = new Uint16Array([msg.payload]);
                    nValue = new opcua.Variant({dataType: opcua.DataType.UInt16, value: uint16[0]});
                    break;
                case"Integer":
                    nValue = new opcua.Variant({dataType: opcua.DataType.UInt16, value: parseInt(msg.payload)});
                    break;
                case"Boolean":
                    if (msg.payload) {
                        nValue = new opcua.Variant({dataType: opcua.DataType.Boolean, value: true})
                    }
                    else {
                        nValue = new opcua.Variant({dataType: opcua.DataType.Boolean, value: false})
                    }
                    break;
                case"String":
                    nValue = new opcua.Variant({dataType: opcua.DataType.String, value: msg.payload});
                    break;
                default:
                    break;
            }

            return nValue;
        }

        node.on("input", function (msg) {

            if (!node.session || !node.action) {
                node.send(msg);
                return;
            }

            if (!msg.topic) {
                verbose_warn("can't work without OPC UA NodeId - msg.topic");
                node.send(msg);
                return;
            }

            verbose_log("Action on input:" + node.action
                + " Item from Topic: " + msg.topic + " session Id: " + node.session.sessionId);

            switch (node.action) {
                case "read":
                    read_action_input(msg);
                    break;
                case "write":
                    write_action_input(msg);
                    break;
                case "subscribe":
                    subscribe_action_input(msg);
                    break;
                case "browse":
                    browse_action_input(msg);
                    break;
				case "events":
					subscribe_events_input(msg);
					break;
                default:
                    break;
            }

            node.send(msg);
        });

        function read_action_input(msg) {

            verbose_log("reading");

            items[0] = msg.topic; // TODO support for multiple item reading

            node.session.readVariableValue(items, function (err, dataValues, diagnostics) {
                if (err) {
                    verbose_log(diagnostics);
                    node.error(err.message);
                    set_node_status_to("error");
                } else {

                    set_node_status_to("active reading");

                    for (var i = 0; i < dataValues.length; i++) {
                        var dataValue = dataValues[i];
                        verbose_log("\tNode : " + (items[i]).cyan.bold);
                        if (dataValue) {
                            try {
                                verbose_log("\tValue : " + dataValue.value.value);
                                verbose_log("\tDataType: " + dataValue.value.dataType);

                                if (dataValue.value.dataType === opcua.DataType.UInt16) {
                                    verbose_log("UInt16:" + dataValue.value.value + " -> Int32:" + ToInt32(dataValue.value.value));
                                }

                                msg.payload = dataValue.value.value;

                                node.send(msg);
                            }
                            catch (e) {
                                node.error("\tBad read: " + dataValue.statusCode, msg);
                            }
                        }

                        if (dataValue.statusCode && dataValue.statusCode.toString(16) == "Good (0x00000)") {
                            verbose_log("\tStatus-Code:" + (dataValue.statusCode.toString(16)).green.bold);
                        }
                        else {
                            verbose_log("\tStatus-Code:" + dataValue.statusCode.toString(16));
                        }
                    }
                }
            });
        }

        function write_action_input(msg) {

            verbose_log("writing");

            // Topic value: ns=2;s=1:PST-007-Alarm-Level@Training?SETPOINT
            var ns = msg.topic.substring(3, 4); // Parse namespace, ns=2
            var s = msg.topic.substring(7);    // Parse nodeId string, s=1:PST-007-Alarm-Level@Training?SETPOINT

            var nodeid = new nodeId.NodeId(nodeId.NodeIdType.STRING, s, ns);

            verbose_log("namespace=" + ns);
            verbose_log("string=" + s);
            verbose_log("value=" + msg.payload);
            verbose_log(nodeid.toString());

            var opcuaVariant = build_new_variant(msg);

            node.session.writeSingleNode(nodeid, opcuaVariant, function (err) {
                if (err) {
                    set_node_status_to("error");
                    node.error(node.name + " Cannot write value (" + msg.payload + ") to msg.topic:" + msg.topic + " error:" + err);
                }
                else {
                    set_node_status_to("active writing");
                    verbose_log("Value written!");
                }
            });
        }

        function subscribe_action_input(msg) {

            verbose_log("subscribing");

            if (!subscription) {
                // first build and start subscription and subscribe on its started event by callback
                subscription = make_subscription(subscribe_monitoredItem, msg);
            }
            else {
                // otherwise check if its terminated start to renew the subscription
                if (subscription.subscriptionId != "terminated") {
                    set_node_status_to("active subscribing");
                    subscribe_monitoredItem(subscription, msg);
                }
                else {
                    subscription = null;
                    monitoredItems.clear();
                    set_node_status_to("terminated");
                }
            }
        }

        function subscribe_monitoredItem(subscription, msg) {

            verbose_log("Session subscriptionId: " + subscription.subscriptionId);

            var monitoredItem = monitoredItems.get({"topicName": msg.topic});

            if (!monitoredItem) {

                var interval = 100;

                if (typeof msg.payload === 'number') {
                    interval = Number(msg.payload);
                }

                verbose_log(msg.topic + " samplingInterval " + interval);

                monitoredItem = subscription.monitor(
                    {nodeId: msg.topic, attributeId: opcua.AttributeIds.Value},
                    {
                        samplingInterval: interval,
                        queueSize: 10,
                        discardOldest: true
                    }
                );

                monitoredItems.add({"topicName": msg.topic, mItem: monitoredItem});

                monitoredItem.on("initialized", function () {
                    verbose_log("initialized monitoredItem on " + msg.topic);
                });

                monitoredItem.on("changed", function (dataValue) {

                    set_node_status_to("active subscribed");

                    verbose_log(msg.topic + " value has changed to " + dataValue.value.value);

                    if (dataValue.statusCode === opcua.StatusCodes.Good) {
                        verbose_log("\tStatus-Code:" + (dataValue.statusCode.toString(16)).green.bold);
                    }
                    else {
                        verbose_log("\tStatus-Code:" + dataValue.statusCode.toString(16));
                    }

                    msg.payload = dataValue.value.value;
                    node.send(msg);
                });

                monitoredItem.on("keepalive", function () {
                    verbose_log("keepalive monitoredItem on " + msg.topic);
                });

                monitoredItem.on("terminated", function () {
                    verbose_log("terminated monitoredItem on " + msg.topic);
                    if (monitoredItems.get({"topicName": msg.topic})) {
                        monitoredItems.delete({"topicName": msg.topic});
                    }
                });
            }

            return monitoredItem;
        }

        function browse_action_input(msg) {

            verbose_log("browsing");

            var NodeCrawler = opcua.NodeCrawler;
            var crawler = new NodeCrawler(node.session);

            crawler.read(msg.topic, function (err, obj) {

                var newMessage = {
                    "topic": msg.topic,
                    "nodeId": "",
                    "browseName": "",
                    "nodeClassType": "",
                    "typeDefinition": "",
                    "payload": ""
                };

                if (!err) {

                    set_node_status_to("active browsing");

                    treeify.asLines(obj, true, true, function (line) {

                        verbose_log(line);

                        if (line.indexOf("browseName") > 0) {
                            newMessage.browseName = line.substring(line.indexOf("browseName") + 12);
                        }
                        if (line.indexOf("nodeId") > 0) {
                            newMessage.nodeId = line.substring(line.indexOf("nodeId") + 8);
                            newMessage.nodeId = newMessage.nodeId.replace("&#x2F;", "\/");
                        }
                        if (line.indexOf("nodeClass") > 0) {
                            newMessage.nodeClassType = line.substring(line.indexOf("nodeClass") + 11);
                        }
                        if (line.indexOf("typeDefinition") > 0) {
                            newMessage.typeDefinition = line.substring(line.indexOf("typeDefinition") + 16);
                            newMessage.payload = Date.now();
                            node.send(newMessage);
                        }

                        set_node_status_to("browse done");

                    });
                }
                else {
                    node.error(err.message);
                    set_node_status_to("error browsing");
                }

            });

        }
        function subscribe_events_input(msg) {

            verbose_log("subscribing events");
			
			var eventFilter = msg.filter;
			var AttributeIds = opcua.AttributeIds;
			var baseEventTypeId = "i=2041"; // BaseEventType;
			var serverObjectId = "i=2253";
			
			var parameters = {
				requestedPublishingInterval: 100,
				requestedLifetimeCount: 1000,
				requestedMaxKeepAliveCount: 12,
				maxNotificationsPerPublish: 10,
				publishingEnabled: true,
				priority: 10
			};
			/*
            if (!subscription) {
                // first build and start subscription and subscribe on its started event by callback
                subscription = make_subscription(subscribe_monitoredItem, msg);
			}
            else {
                // otherwise check if its terminated start to renew the subscription
                if (subscription.subscriptionId != "terminated") {
                    subscribe_monitoredItem(subscription, msg);
                }
                else {
                    subscription = null;
                    monitoredItems.clear();
                    node.status({fill: "red", shape: "ring", text: "terminated"});
                }
            }
			*/
			if (!event_subscription) {
				event_subscription = new opcua.ClientSubscription(node.session, parameters);
			}
			
			var event_monitoringItem = event_subscription.monitor(
				{
					nodeId:      msg.topic, // serverObjectId,
					attributeId: AttributeIds.EventNotifier
				},
				{
					queueSize: 100000,
					filter: msg.eventFilter,
					discardOldest: true
				}
			);

			event_monitoringItem.on("initialized", function () {
				verbose_log("event_monitoringItem initialized");
				callback();
			});

			event_monitoringItem.on("changed", function (eventFields) {
				dumpEvent(node, node.session, msg.eventFields, eventFields, function() {});
			});
			event_monitoringItem.on("err", function (err_message) {
				node.err("event_monitoringItem ", msg.eventTypeId, " ERROR".red, err_message);
			});
		}

        node.on("close", function () {

            if (node.session) {

                if (subscription) {
                    subscription.terminate();
                    // subscription becomes null by its terminated event
                }

                node.session.close(function (err) {

                    verbose_log("Session closed");
                    set_node_status_to("session closed");
                    if (err) {
                        node.error(node.name + " " + err);
                    }

                    node.session = null;

                    if (node.client) {

                        node.client.disconnect(function () {
                            node.client = null;
                            verbose_log("Client disconnected!");
                        });
                    }
                });
            }

            set_node_status_to("closed");
        });

        node.on("error", function () {

            if (node.session) {

                if (subscription) {
                    subscription.terminate();
                    // subscription becomes null by its terminated event
                }

                node.session.close(function (err) {

                    verbose_log("Session closed on error emit");
                    if (err) {
                        node.error(node.name + " " + err);
                    }

                    set_node_status_to("session closed");
                    node.session = null;

                    if (node.client) {

                        node.client.disconnect(function () {
                            node.client = null;
                            verbose_log("Client disconnected!");
                        });
                    }

                });
            }

            set_node_status_to("node error");
        });
    }

    RED.nodes.registerType("OpcUa-Client", OpcUaClientNode);
};
