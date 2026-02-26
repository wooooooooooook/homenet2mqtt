## 코콤
## references
[https://deepwiki.com/zooil/kocomRS485](https://deepwiki.com/zooil/kocomRS485)
[https://deepwiki.com/lunDreame/kocom-wallpad](https://deepwiki.com/lunDreame/kocom-wallpad)

## 기본구조:

| 0 | 1 | 2 | 3 | 4 | 5 | ...| length|
|---|---|---|---|---|---|---|---|
|prefix |prefix|0x30| 명령/응답 ||  || ...|checksum|
| 0xAA|0x55 | 0x30 |0xbx: 명령</br> 0xdx: 응답 | | | | | |