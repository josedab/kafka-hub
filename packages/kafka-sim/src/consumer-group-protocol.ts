import type {
  Assignor,
  ClassicAssignmentBehavior,
  GroupProtocol,
} from "./engine-types";

function defaultAssignor(
  groupProtocol: GroupProtocol,
  classicAssignmentBehavior?: ClassicAssignmentBehavior,
): Assignor {
  if (groupProtocol === "consumer") return "uniform";
  if (classicAssignmentBehavior === "eager") return "range";
  return "cooperative-sticky";
}

function resolveAssignor(
  groupProtocol: GroupProtocol,
  classicAssignmentBehavior?: ClassicAssignmentBehavior,
  explicit?: Assignor,
): Assignor {
  if (!explicit) return defaultAssignor(groupProtocol, classicAssignmentBehavior);
  if (groupProtocol === "consumer") return "uniform";
  if (explicit === "uniform") return defaultAssignor(groupProtocol, classicAssignmentBehavior);
  if (explicit === "cooperative-sticky" && classicAssignmentBehavior === "eager") return "range";
  if (
    classicAssignmentBehavior === "cooperative" &&
    explicit !== "cooperative-sticky"
  ) {
    return "cooperative-sticky";
  }
  return explicit;
}

export function resolveProtocolAxes(input: {
  protocol?: "eager" | "cooperative";
  groupProtocol?: GroupProtocol;
  classicAssignmentBehavior?: ClassicAssignmentBehavior;
  assignor?: Assignor;
}): {
  groupProtocol: GroupProtocol;
  classicAssignmentBehavior?: ClassicAssignmentBehavior;
  assignor: Assignor;
} {
  if (input.groupProtocol) {
    const classicBehavior = input.groupProtocol === "classic"
      ? (input.classicAssignmentBehavior ?? "cooperative")
      : undefined;
    return {
      groupProtocol: input.groupProtocol,
      classicAssignmentBehavior: classicBehavior,
      assignor: resolveAssignor(input.groupProtocol, classicBehavior, input.assignor),
    };
  }
  if (input.protocol === "eager") {
    return {
      groupProtocol: "classic",
      classicAssignmentBehavior: "eager",
      assignor: resolveAssignor("classic", "eager", input.assignor),
    };
  }
  if (input.protocol === "cooperative") {
    return {
      groupProtocol: "classic",
      classicAssignmentBehavior: "cooperative",
      assignor: resolveAssignor("classic", "cooperative", input.assignor),
    };
  }
  return {
    groupProtocol: "classic",
    classicAssignmentBehavior: "cooperative",
    assignor: resolveAssignor("classic", "cooperative", input.assignor),
  };
}
