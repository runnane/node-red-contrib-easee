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

    node.doLogin = () => {
      let url = '/accounts/login';
      node.doRestCall(
        url,
        { 
          userName: node.connectionConfig.credentials.username, 
          password: node.connectionConfig.credentials.password 
        },
        "post",
        {}
      ).then(json => {
        node.send( { topic: url, payload: json, auth: {
          accessToken: node.connectionConfig.accessToken,
          refreshToken: node.connectionConfig.refreshToken,
          tokenExpires: node.connectionConfig.tokenExpires
        }} );
      });
    }
    this.on('input', function(msg, send, done) {
      let url = '';
      if(msg.topic == "login"){
        node.doLogin();
      }else{
        switch(msg.topic){
          case "refresh_token":
            url = '/accounts/refresh_token';
            node.doAuthRestCall(
              url,
              "post",
              {},
              {
                accessToken : node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken
              }
            ).then( json => {
              node.connectionConfig.accessToken = json.accessToken;
              node.connectionConfig.refreshToken = json.refreshToken;
              var t = new Date();
              t.setSeconds(t.getSeconds() + json.expiresIn);
              node.connectionConfig.tokenExpires = t;

              node.send( { topic: url, payload: json, auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires
              }} );
            });
          break;
          case "charger":
            url = "/chargers/" + node.charger;
            node.doAuthRestCall(url).then( json => {
              node.send( { topic: url, payload: json, auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires
              }})});
          break;
          case "charger_details":
            url = "/chargers/" + node.charger + "/details";
            node.doAuthRestCall(url).then( json => {
              node.send( { topic: url, payload: json, auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires
              }})});
          break;
          case "charger_state":
            url = "/chargers/" + node.charger + "/state";
            node.doAuthRestCall(url).then( json => {
              node.send( { topic: url, payload: json, auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires
              }})});

          break;
          case "charger_site":
            url = "/chargers/" + node.charger + "/site";
            node.doAuthRestCall(url).then( json => {
              node.send( { topic: url, payload: json, auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires
              }})});
          break;

          case "charger_session_latest":
            url = "/chargers/" + node.charger + "/sessions/latest";
            node.doAuthRestCall(url).then( json => {
              node.send( { topic: url, payload: json, auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires
              }})});
          break;

          case "charger_session_ongoing":
            url = "/chargers/" + node.charger + "/sessions/ongoing";
            node.doAuthRestCall(url).then( json => {
              node.send( { topic: url, payload: json, auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires
              }})});
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
      //console.log(parms);
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
          return response.json();
        }).then(json => {
          node.status({
            fill: "green",
            shape: "dot",
            text: url
          });
         
          return json;
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
        
      });
     
      return response;

    };
   
  }
    
  RED.nodes.registerType("easee-rest-client", EaseeRestClient);

}