/**
 * charger-streaming-client's guard for a missing configuration node.
 *
 * `RED.nodes.getNode(node.configurationNode)` returns undefined when the flow
 * property points at a configuration node that does not exist (deleted from the
 * flow, or a corrupted flow file) — nothing throws, so this has to be checked
 * explicitly. Uncovered before EASEE-10: no test constructed the node without a
 * resolvable configuration node, so the early-return guard at the top of the
 * constructor never ran.
 */

import { describe, expect, test, vi } from "vitest";
import streamingClientNode from "../../easee-client/charger-streaming-client.js";
import { createMockRED } from "../mocks/nodeRedMocks.js";

describe("charger-streaming-client — missing configuration node", () => {
  test("emits erro and sets a red status instead of throwing, and never wires up the input handler", () => {
    const RED = createMockRED();
    // The condition under test: no configuration node resolves for the id the
    // flow property names.
    RED.nodes.getNode = vi.fn(() => undefined);
    RED.nodes.createNode = vi.fn((node: any) => {
      node.status = vi.fn();
      node.emit = vi.fn();
      node.error = vi.fn();
      node.warn = vi.fn();
      node.on = vi.fn();
      node.send = vi.fn();
    });

    streamingClientNode(RED);
    const StreamingClientConstructor = RED.nodes.registerType.mock.calls[0][1];

    const node = new StreamingClientConstructor({
      id: "streaming1",
      type: "charger-streaming-client",
      charger: "EH000000",
      configuration: "config-does-not-exist",
    });

    // Reported straight to node.error(): the "erro" this used to emit had no
    // listener yet, so only the status ever reached the user (EASEE-26).
    expect(node.error).toHaveBeenCalledWith(
      "[easee] Cannot start: No easee-configuration node is selected. Open this node, select or add an easee-configuration node, then deploy.",
    );
    expect(node.status).toHaveBeenCalledWith({
      fill: "red",
      shape: "ring",
      text: "No configuration node",
    });
    // The guard returns before the constructor reaches the rest of its setup.
    expect(node.on).not.toHaveBeenCalledWith("input", expect.anything());
  });
});
