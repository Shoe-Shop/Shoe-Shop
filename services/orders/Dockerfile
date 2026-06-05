# Orders service image (Java 21 · Spring Boot 3 · gRPC + NATS).
# Build context is the REPO ROOT (see deploy/compose/compose.checkout.yaml) so the
# single-source-of-truth proto contract (proto/orders/v1) is copied into the Maven
# build. The four MELT signals are emitted by the OpenTelemetry Java agent
# (-javaagent), configured purely via OTEL_* env in Compose; only NATS trace
# propagation is hand-wired in app code (ADR-0003 §5).
#
#   docker build -f services/orders/Dockerfile -t shoeshop/orders:dev .
# syntax=docker/dockerfile:1

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src/services/orders

# pom first so the dependency download layer is cached unless the pom changes.
COPY services/orders/pom.xml ./pom.xml
# Proto contract (canonical copy lives in /proto) compiled by protobuf-maven-plugin.
COPY proto/orders ./src/main/proto/orders
COPY services/orders/src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -DskipTests package

# OpenTelemetry Java agent — auto-instruments Spring, grpc-netty, JDBC and logback
# for traces + RED metrics (with native exemplars) + trace-correlated logs. Pinned
# for reproducibility (the repo's "no floating tags" rule).
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.28.1/opentelemetry-javaagent.jar /otel/opentelemetry-javaagent.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /otel/opentelemetry-javaagent.jar /otel/opentelemetry-javaagent.jar
COPY --from=build /src/services/orders/target/orders-0.3.0.jar /app/orders.jar
EXPOSE 9090
ENTRYPOINT ["java","-javaagent:/otel/opentelemetry-javaagent.jar","-jar","/app/orders.jar"]
