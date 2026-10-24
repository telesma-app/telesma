import { Sources, SourceState } from "../../bindings/github.com/telesma-app/kit/model/report";
import { SmartCardReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { DescriptorState } from "../../bindings/github.com/telesma-app/kit/model/report";
import { USBReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import {
  DeviceReport,
  EndpointReport,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { Mode, SmartCardInterface } from "../../bindings/github.com/telesma-app/kit/transport";

export function testHIDDevice(id = "token-1", product = "Test key") {
  return new EndpointReport({
    sources: new Sources({
      hidInit: { state: SourceState.SourceNotRequested },
      getInfo: { state: SourceState.SourceNotRequested },
      mds: { state: SourceState.SourceNotRequested },
      yubico: { state: SourceState.SourceNotRequested },
      token2: { state: SourceState.SourceNotRequested },
    }),
    attachment: {
      id,
      transport: Mode.ModeHID,
      usb: new USBReport({
        product: { state: DescriptorState.DescriptorRead, value: product },
        vendorId: { state: DescriptorState.DescriptorRead, value: 1 },
        productId: { state: DescriptorState.DescriptorRead, value: 2 },
      }),
    },
  });
}

export function testSmartCardDevice(id = "card-1") {
  return new EndpointReport({
    sources: new Sources({
      hidInit: { state: SourceState.SourceNotRequested },
      getInfo: { state: SourceState.SourceNotRequested },
      mds: { state: SourceState.SourceNotRequested },
      yubico: { state: SourceState.SourceNotRequested },
      token2: { state: SourceState.SourceNotRequested },
    }),
    attachment: {
      id,
      transport: Mode.ModeSmartCard,
      smartCard: new SmartCardReport({
        reader: "Test reader",
        interface: SmartCardInterface.SmartCardInterfaceUnknown,
      }),
    },
  });
}

export function testTopology(endpoints: EndpointReport[]) {
  return {
    devices: endpoints.map(
      (endpoint) =>
        new DeviceReport({ id: endpoint.attachment.id, endpointIds: [endpoint.attachment.id] }),
    ),
    endpoints,
  };
}
