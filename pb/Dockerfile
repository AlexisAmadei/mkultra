FROM alpine:3.20

ARG PB_VERSION=0.39.6

RUN apk add --no-cache ca-certificates unzip wget \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pb.zip \
    && unzip /tmp/pb.zip -d /pb \
    && rm /tmp/pb.zip \
    && apk del unzip wget \
    && chmod +x /pb/pocketbase

WORKDIR /pb
COPY pb_migrations ./pb_migrations

EXPOSE 8090
VOLUME /pb/pb_data

ENTRYPOINT ["/pb/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090"]
