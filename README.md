# web3tools说明文档

twitter: https://x.com/wohefengyiyang
github地址: https://github.com/web3-monitor/web3tools
代码持续更新中...

1.clone项目文件到本地

2.cd web3tools 进入项目文件夹

3.执行 npm install 命令安装项目依赖

4.输入不同的命令执行不同的脚本方法

## 1. solana脚本
### 配置及相关文件
web3tools/scripts/chain/solana文件夹

config.json文件是相关网络配置，可自由切换。如果想使用自己的rpc, 直接进行修改替换

wallets.json文件存储的是你的solana钱包，gasWallet为支付网络费用的钱包，mainWallet为主钱包，sonWallets为子钱包。接下来的方法中，分发代币都是从主钱包到子钱包，收集代币都是从子钱包到主钱包

### solana脚本命令
node . solana xxx yyy zzz 表示执行的是solana的脚本，xxx代表方法，yyy、zzz代表方法需要的参数，参数可按照下面的说明自行更改，方法不可修改

1.测试网领水方法，主网不可用，领水账号为mainWallet
```
node . solana faucet
```
2.批量生成solana钱包，第一个参数：100 表示生成钱包的数量，第二个参数表示私钥的类型(可选：bs58, unit8, all)
```
node . solana create 100 bs58
```
3.生成solana靓号钱包，prefix为前缀，suffix为后缀，8为线程数，如果只想生成前缀不想生成后缀，后缀参数就输入 ' ' ，反之亦然
```
node . solana createPretty prefix suffix 8
```
4.主钱包向每个子钱包发送0.01sol
```
node . solana distribute 0.01
```
5.每个子钱包向主钱包发送0.01sol，如果输入 node . solana collect 0 all ，表示将子钱包中的所有sol都发送给主钱包
```
node . solana collect 0.01
node . solana collect 0 all
```
6.给钱包生成合约代币账户（子钱包会生成合约代币账户，账户费用约0.002sol，从本钱包扣，后续如果不使用，可以退回费用），第一个参数为代币的合约地址
、、、
node . solana createSplTokenAccount ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82
、、、
7.关闭钱包的合约代币账户（账户费用0.002sol会退回到钱包）
```
node . solana closeSplTokenAccount ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82
```
8.主钱包向每个子钱包发送100个合约代币，第一个参数为代币的合约地址，第二个为数量（如果子钱包没有对应的合约代币账户，会自动开户，费用约0.002sol，从gasWallet扣，后续可以通过关闭合约代币账户退回（需要确认钱包里没有这个币了））
```
node . solana distributeSpl ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82 100
```
9.每个子钱包向主钱包发送100个合约代币，如果输入 node . solana collectSpl ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82 0 all ，表示将子钱包中的此合约对应的所有合约代币都发送给主钱包
```
node . solana collectSpl ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82 100
node . solana collectSpl ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82 0 all
```
