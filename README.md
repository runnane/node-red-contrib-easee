
# @runnane/node-red-contrib-easee npm module

[![npm](https://img.shields.io/npm/v/@runnane/node-red-contrib-easee.svg?maxAge=2592000)](https://www.npmjs.com/package/@runnane/node-red-contrib-easee)
[![downloads](https://img.shields.io/npm/dt/@runnane/node-red-contrib-easee.svg?maxAge=2592000)](https://www.npmjs.com/package/@runnane/node-red-contrib-easee)

Node-Red module for streaming Easee charger data. 

## Features
+ SignalR streaming client
+ Some REST commands implemented

## Howto
`npm i @runnane/node-red-contrib-easee`

Use the easee `rest - client node` or the `easee charger streaming client`
Configure the node with username/password and the Charger ID.

## Streaming node
  Configure the node with username/password and a Charger ID ("EH000000").
  Streaming telemetry from the signalR enpoint will be available in the fourth output, 
  the `ProductUpdate` one.

## REST node
Configure the node with username/password and a Charger ID ("EH000000").
Send the your selected command as the topic into the node.

Implemented commands that may be sent as topic, are:
+ `login`
+ `refresh_token`
+ `charger`
+ `charger_details`
+ `charger_state`
+ `charger_site`
+ `charger_session_latest`
+ `charger_session_ongoing`
+ `stop_charging`
+ `start_charging`
+ `pause_charging`
+ `resume_charging`
+ `toggle_charging`



## Todo
+ Documentation and examples
+ Better error handling - Promises need rejects and catch
+ Testing multiple chargers
+ Additional REST commands

## Credits
+ Initially forked from [node-red-contrib-signalrcore](https://github.com/scottpage/node-red-contrib-signalrcore), then rewritten