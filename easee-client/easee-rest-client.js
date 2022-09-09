/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/


module.exports = function (RED) {
  "use strict";
  const signalR = require("@microsoft/signalr");
  const fetch = require('node-fetch');
  var inspect = require("util").inspect;

  // =======================
  // === The node itself ===
  // =======================
  function EaseeRestClient(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    node.charger = n.charger;
    node.configurationNode = n.configuration;
    node.connectionConfig = RED.nodes.getNode(node.configurationNode);

    if (!this.connectionConfig) {
      this.error("Missing easee configuration");
      return;
    }

    node.genericCall = (url,send=true) => {
      return node.doAuthRestCall(url).then( json => {
        if(send && json){
          node.send( { topic: url, payload: json, auth: {
            accessToken: node.connectionConfig.accessToken,
            refreshToken: node.connectionConfig.refreshToken,
            tokenExpires: node.connectionConfig.tokenExpires,
            tokenExpiresIn: Math.floor((node.connectionConfig.tokenExpires-(new Date()))/1000)
          }});
        }
        return json;
      }).catch( error => {
        console.error(error);
        node.warn(error);
      });
    };


    this.on('input', function(msg, send, done) {
      let url = '';
      if(msg.topic == "login"){

          node.connectionConfig.doLogin().then(json => {
            node.send( { topic: "/accounts/login/", payload: json, auth: {
              accessToken: node.connectionConfig.accessToken,
              refreshToken: node.connectionConfig.refreshToken,
              tokenExpires: node.connectionConfig.tokenExpires,
              tokenExpiresIn: node.connectionConfig.tokenExpires-(new Date())
            }} );
          }).catch( error => {
            console.error(error);
            node.warn(error);
          });
      
      }else if(msg.topic == "refresh_token"){
          node.connectionConfig.doRefreshToken().then(json => {
            node.send( { topic: "/accounts/refresh_token/", payload: json, auth: {
              accessToken: node.connectionConfig.accessToken,
              refreshToken: node.connectionConfig.refreshToken,
              tokenExpires: node.connectionConfig.tokenExpires,
              tokenExpiresIn: node.connectionConfig.tokenExpires-(new Date())
            }} );
          }).catch( error => {
            console.error(error);
            node.warn(error);
          });
      
        
       
      }else{
        try {
          switch(msg.topic){

            case "charger":
              node.genericCall("/chargers/" + node.charger);
            break;

            case "charger_details":
              node.genericCall("/chargers/" + node.charger + "/details");
            break;

            case "charger_state":
              node.genericCall("/chargers/" + node.charger + "/state", false).then( json => {
                try{
                  if(typeof json !== "object"){
                    //node.warn("charger_state failed");s
                    node.error("charger_state failed");
                  }else{
                    Object.keys(json).forEach(idx => {
                      json[idx] = node.connectionConfig.parseObservation({ dataName: idx, value: json[idx], origValue: json[idx]}, "name");
                    });
                    node.send( { topic: url, payload: json, auth: {
                      accessToken: node.connectionConfig.accessToken,
                      refreshToken: node.connectionConfig.refreshToken,
                      tokenExpires: node.connectionConfig.tokenExpires,
                      tokenExpiresIn: Math.floor((node.connectionConfig.tokenExpires-(new Date()))/1000)
                    }});
                  }
                } catch( e){
                  node.warn("command failed: " + error);
                  node.error("command failed: " + error);
                }
              });
            break;

            case "charger_site":
              node.genericCall("/chargers/" + node.charger + "/site");
            break;

            case "charger_session_latest":
              node.genericCall("/chargers/" + node.charger + "/sessions/latest");
            break;

            case "charger_session_ongoing":
              node.genericCall("/chargers/" + node.charger + "/sessions/ongoing");
            break;
            
            default:
              node.send( { topic: "error", payload: "Unknown topic"} )
              node.status({
                fill: "red",
                shape: "dot",
                text: "Unknown topic"
              });
            break;
            
            }
        } catch (error) {
          node.warn("command failed: " + error);
        } 
      }
     
      if (done) {
        done();
      }
    });

    node.doAuthRestCall = async (url, method="get", headers = {}, parms = {}) => {
      headers = { ...headers, Accept: 'application/json', 'Content-Type': 'application/json',
          Authorization: "Bearer " + node.connectionConfig.accessToken
      };
      const strPayload = JSON.stringify(parms);
      if(!node.connectionConfig.accessToken){
        node.send( { topic: "error", payload: "not logged in"} )
        node.status({
          fill: "red",
          shape: "dot",
          text: "not logged in"
        });
        return;
      }

      const response = await fetch(node.connectionConfig.RestApipath + url, {
        method: method,
        headers: headers,
        body: (method=="post")?strPayload:null,
        }).then(response => {
          if(!response.ok){
            console.error("Could not fetch(): " + response.statusText);
            throw Error("REST Command failed, check username/password/charger ID")
          }
          return response.json();
        }).then(json => {
          node.status({
            fill: "green",
            shape: "dot",
            text: url
          });
         
          return json;
        }).catch(error => {
          node.error(error);
          console.error(error);
        });
      return response;
    };


    node.doRestCall = async (url, parms, method="post", headers={}) => {
      headers = { ...headers, Accept: 'application/json', 'Content-Type': 'application/json'};
      const strPayload = JSON.stringify(parms);

      const response = await fetch(node.connectionConfig.RestApipath + url, {
        method: method,
        body: strPayload,
        headers: headers
      }).then(response => {
        if(!response.ok){
          throw Error("REST Command failed, check username/password/charger ID")
        }
        return response.json();
      }).then(json => {

        if("accessToken" in json){
          node.connectionConfig.accessToken = json.accessToken;
          node.connectionConfig.refreshToken = json.refreshToken;
          var t = new Date();
              t.setSeconds(t.getSeconds() + json.expiresIn);
              node.connectionConfig.tokenExpires = t;
        }
        node.status({
          fill: "green",
          shape: "dot",
          text: url
        });
        return json;
        
      }).catch(error => {
        node.error(error);
        console.error(error);
      });     
      return response;

    };
   
  }
    
  RED.nodes.registerType("easee-rest-client", EaseeRestClient);

}