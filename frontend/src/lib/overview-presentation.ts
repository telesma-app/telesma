import type { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import type { BioSensorEnvelope } from "../../bindings/telesma/service";
import { SourceState } from "../../bindings/github.com/telesma-app/kit/model/report";
import { bioSensorReport } from "$lib/ctapkit-results.js";
import { failureMessage } from "$lib/failure";
import type { LoadState } from "$lib/load-state.js";
import { buildOverviewFactLookup } from "$lib/overview-facts.js";
import { buildOverviewVendorPassport, sourceMessage } from "$lib/overview-sources";
import {
  buildOverviewHero,
  buildOverviewHeroSignalGroups,
  buildOverviewMDSObservations,
  buildOverviewRows,
  buildOverviewStandardPresentation,
  groupOverviewRows,
} from "$lib/overview-rules.js";

export type OverviewPresentationInput = {
  selectedSelector: string;
  selectedDevice: EndpointReport | null;
  endpoints: EndpointReport[];
  overviewBioSensorState: LoadState<BioSensorEnvelope>;
};

export type OverviewPresentation = ReturnType<typeof buildOverviewPresentation>;

export function buildOverviewPresentation(input: OverviewPresentationInput) {
  const device = input.selectedDevice;
  const info = device?.sources.getInfo.data;
  const mds = device?.sources.mds.data ?? null;
  const mdsLoading = device?.sources.mds.state === SourceState.SourceLoading;
  const mdsError = device?.sources.mds.error ? sourceMessage(device.sources.mds) : "";
  const bioSensor = bioSensorReport(input.overviewBioSensorState.data);
  const facts = info ? buildOverviewFactLookup(info.assessment) : null;
  const rows = buildOverviewRows({ info, device, bioSensor }, facts ?? undefined);
  const hero = buildOverviewHero({
    info,
    device,
    endpoints: input.endpoints,
    mds,
    mdsLoading,
    mdsError,
  });
  return {
    selector: input.selectedSelector,
    loading: Boolean(
      device &&
      Object.values(device.sources).some(
        (source) => source.state === SourceState.SourceLoading && source !== device.sources.mds,
      ),
    ),
    bioFailure: input.overviewBioSensorState.error
      ? failureMessage(input.overviewBioSensorState.error)
      : "",
    mdsLoading,
    report: device,
    info,
    hero,
    vendorPassport: buildOverviewVendorPassport(input.endpoints),
    infoFailure:
      !info && device?.sources.getInfo.error ? failureMessage(device.sources.getInfo.error) : "",
    standard: facts
      ? buildOverviewStandardPresentation({ facts, mdsState: hero.mdsState, mds, device })
      : null,
    signalGroups: facts ? buildOverviewHeroSignalGroups(facts) : [],
    overviewGroups: groupOverviewRows(rows),
    mdsObservations: buildOverviewMDSObservations({ info, mds }),
    warningCount: rows.filter((row) => row.status === "warning").length,
  };
}
