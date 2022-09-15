const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { joinSignature } = require('ethers/lib/utils');
const { ethers, network } = require('hardhat');
const Web3 = require('web3');

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

const DATA = "0x02";

xdescribe('===Jar===', function () {
    let deployer, signer1, signer2, signer3, multisig;

    let vat, 
        spot, 
        amaticc,
        gemJoin, 
        jug,
        vow,
        jar;

    let oracle;

    let wad = "000000000000000000", // 18 Decimals
        ray = "000000000000000000000000000", // 27 Decimals
        rad = "000000000000000000000000000000000000000000000", // 45 Decimals
        ONE = 10 ** 27;


    let collateral = ethers.utils.formatBytes32String("aMATICc");

    beforeEach(async function () {

        ////////////////////////////////
        /** Deployments ------------ **/
        ////////////////////////////////

        [deployer, signer1, signer2, signer3, multisig] = await ethers.getSigners();

        this.Vat = await ethers.getContractFactory("Vat");
        this.Spot = await ethers.getContractFactory("Spotter");
        this.GemJoin = await ethers.getContractFactory("GemJoin");
        this.SikkaJoin = await ethers.getContractFactory("SikkaJoin");
        this.Sikka = await ethers.getContractFactory("Sikka");
        this.Jug = await ethers.getContractFactory("Jug");
        this.Vow = await ethers.getContractFactory("Vow");
        this.Jar = await ethers.getContractFactory("Jar");
        this.Oracle = await ethers.getContractFactory("Oracle"); // Mock Oracle

        // Core module
        vat = await this.Vat.connect(deployer).deploy();
        await vat.deployed();
        spot = await this.Spot.connect(deployer).deploy();
        await spot.deployed();
        await spot.initialize(vat.address);

        // Collateral module
        amaticc = await this.Sikka.connect(deployer).deploy();
        await amaticc.deployed(); // Collateral
        await amaticc.initialize(0, "SIKKA", "100000000" + wad);

        
        gemJoin = await this.GemJoin.connect(deployer).deploy();
        await gemJoin.deployed();
        await gemJoin.initialize(vat.address, collateral, amaticc.address);

        // Sikka module
        sikka = await this.Sikka.connect(deployer).deploy();
        await sikka.deployed(); // Stable Coin
        await sikka.initialize(0, "SIKKA", "100000000" + wad)
        
        sikkaJoin = await this.SikkaJoin.connect(deployer).deploy();
        await sikkaJoin.deployed();
        await sikkaJoin.initialize(vat.address, sikka.address)

        // Rates module
        jug = await this.Jug.connect(deployer).deploy();
        await jug.deployed();
        await jug.initialize(vat.address)

        // System Stabilizer module (balance sheet)
        vow = await this.Vow.connect(deployer).deploy();
        await vow.deployed();
        await vow.initialize(vat.address, sikkaJoin.address, multisig.address)

        // Jar module 
        jar = await this.Jar.connect(deployer).deploy();
        await jar.deployed();
        await jar.initialize("Sikka USB", "SIKKA")

        // Oracle module
        oracle = await this.Oracle.connect(deployer).deploy();
        await oracle.deployed();

        //////////////////////////////
        /** Initial Setup -------- **/
        //////////////////////////////

        // Initialize Oracle Module
        // 2.000000000000000000000000000 ($) * 0.8 (80%) = 1.600000000000000000000000000, 
        // 2.000000000000000000000000000 / 1.600000000000000000000000000 = 1.250000000000000000000000000 = mat
        await oracle.connect(deployer).setPrice("2" + wad); // 2$, mat = 80%, 2$ * 80% = 1.6$ With Safety Margin

        // Initialize Core Module 
        await vat.connect(deployer).init(collateral);
        await vat.connect(deployer).rely(gemJoin.address);
        await vat.connect(deployer).rely(spot.address);
        await vat.connect(deployer).rely(jug.address);
        await vat.connect(deployer)["file(bytes32,uint256)"](ethers.utils.formatBytes32String("Line"), "5000" + rad); // Normalized USB
        await vat.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral, ethers.utils.formatBytes32String("line"), "5000" + rad); // Normalized USB

        await spot.connect(deployer)["file(bytes32,bytes32,address)"](collateral, ethers.utils.formatBytes32String("pip"), oracle.address);
        await spot.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral, ethers.utils.formatBytes32String("mat"), "1250000000000000000000000000"); // Liquidation Ratio
        await spot.connect(deployer)["file(bytes32,uint256)"](ethers.utils.formatBytes32String("par"), "1" + ray); // It means pegged to 1$
        await spot.connect(deployer).poke(collateral);

        // Initialize Collateral Module [User should approve gemJoin while joining]

        // Initialize Sikka Module
        await sikka.connect(deployer).rely(sikkaJoin.address);

        // Initialize Rates Module
        await jug.connect(deployer)["file(bytes32,uint256)"](ethers.utils.formatBytes32String("base"), "1000000000315529215730000000"); // 1% Yearly
        // evm does not support stopping time for now == rho, so we create a mock contract which calls both functions to set duty
        let proxyLike = await (await (await ethers.getContractFactory("ProxyLike")).connect(deployer).deploy(jug.address, vat.address)).deployed();
        await jug.connect(deployer).rely(proxyLike.address);
        await proxyLike.connect(deployer).jugInitFile(collateral, ethers.utils.formatBytes32String("duty"), "0000000000312410000000000000"); // 1% Yearly Factored
        await jug.connect(deployer)["file(bytes32,address)"](ethers.utils.formatBytes32String("vow"), vow.address);

        // Signer1, Signer2 and Signer3 have some aMATICc
        await amaticc.connect(deployer).mint(signer1.address, ethers.utils.parseEther("5000"));
        await amaticc.connect(deployer).mint(signer2.address, ethers.utils.parseEther("5000"));
        await amaticc.connect(deployer).mint(signer3.address, ethers.utils.parseEther("5000"));

        // Signer1, Signer2 and Signer3 entered the system with 1000, 2000, and 3000 respectively (Unlocked)
        await amaticc.connect(signer1).approve(gemJoin.address, ethers.utils.parseEther("1000"));
        await gemJoin.connect(signer1).join(signer1.address, ethers.utils.parseEther("1000"));
        await amaticc.connect(signer2).approve(gemJoin.address, ethers.utils.parseEther("2000"));
        await gemJoin.connect(signer2).join(signer2.address, ethers.utils.parseEther("2000"));
        await amaticc.connect(signer3).approve(gemJoin.address, ethers.utils.parseEther("3000"));
        await gemJoin.connect(signer3).join(signer3.address, ethers.utils.parseEther("3000"));
        
        // Signer1, Signer2 and Signer3 collateralize 500, 1000 and 1500 respectively
        await vat.connect(signer1).frob(collateral, signer1.address, signer1.address, signer1.address, ethers.utils.parseEther("500"), 0); // 500 * 1.6$ = 800$ worth locked
        await vat.connect(signer2).frob(collateral, signer2.address, signer2.address, signer2.address, ethers.utils.parseEther("1000"), 0); // 1000 * 1.6$ = 1600$ worth locked
        await vat.connect(signer3).frob(collateral, signer3.address, signer3.address, signer3.address, ethers.utils.parseEther("1500"), 0); // 1500 * 1.6$ = 2400$ worth locked

        // // Signer1, Signer2 and Signer2 borrow Sikka respectively
        let debt_rate = await (await vat.ilks(collateral)).rate;
        let sikka_amount1 = (400000000000000000000 / debt_rate) * ONE;
        let sikka_amount2 = (800000000000000000000 / debt_rate) * ONE;
        let sikka_amount3 = "1200000000000000000000";
    
        await vat.connect(signer1).frob(collateral, signer1.address, signer1.address, signer1.address, 0, sikka_amount1.toString()); // 400 USBs
        await vat.connect(signer2).frob(collateral, signer2.address, signer2.address, signer2.address, 0, sikka_amount2.toString()); // 800 USBs
        await vat.connect(signer3).frob(collateral, signer3.address, signer3.address, signer3.address, 0, sikka_amount3); // 1200 USBs
        await network.provider.send("evm_mine");
        await network.provider.send("evm_setAutomine", [false]);
        // await network.provider.send("evm_setNextBlockTimestamp", ["TIME"]) 
        // await hre.ethers.provider.send('evm_increaseTime', [7 * 24 * 60 * 60]);

        await network.provider.send("evm_mine")
        debt_rate = await (await vat.ilks(collateral)).rate;
        // console.log("ILK_RATE      : " + debt_rate.toString());
        // console.log("Sikka(signer1)  : " + await (await vat.connect(signer1).sikka(signer3.address)).toString());
        // console.log("Debt          : " + await (await vat.connect(signer1).debt()).toString());

        // Update Stability Fees
        await network.provider.send("evm_increaseTime", [157680000]); // Jump 5 Year
        await jug.connect(deployer).drip(collateral);
        await network.provider.send("evm_mine");
        
        debt_rate = await (await vat.ilks(collateral)).rate;
        // console.log("---After One Year");
        // console.log("ILK_RATE      : " + debt_rate.toString());
        // console.log("Debt          : " + await (await vat.connect(signer1).debt()).toString());
        // let sikkaWithStabilityFee = (debt_rate * await (await vat.connect(signer1).urns(collateral, signer1.address)).art) / ONE; // rate * art = sikka 
        // let stabilityFee = (sikkaWithStabilityFee - (await vat.connect(signer1).sikka(signer1.address) / ONE)); // S.fee = sikkaWithStabilityFee - sikka
        // console.log("S.Fee(signer1): " + stabilityFee + " in USB (2% After 5 Years)");

        // Vat has surplus amount of about 249 USBs now because stability fees
        await network.provider.send("evm_setAutomine", [true]);
    });

    describe('---join ---exit', function () {
        it('Case', async function () {

            await network.provider.send("evm_setAutomine", [false]);
            let tau;

            {
                tau = (await ethers.provider.getBlock()).timestamp;
                await network.provider.send("evm_setNextBlockTimestamp", [tau + 1]);
                await network.provider.send("evm_mine");
                // console.log((await ethers.provider.getBlock()).timestamp)
            }

            {
                tau = (await ethers.provider.getBlock()).timestamp;
                await network.provider.send("evm_setNextBlockTimestamp", [tau + 1]);

                await jar.connect(deployer).initialize(sikka.address, "10", "10");

                vat.connect(signer1).hope(sikkaJoin.address);
                await sikkaJoin.connect(signer1).exit(signer1.address, "50" + wad);
                await sikka.connect(signer1).approve(jar.address, "50" + wad);
                await jar.connect(signer1).join("50" + wad);

                await network.provider.send("evm_mine"); // PreJoin

                expect(await sikka.balanceOf(multisig.address)).to.equal(0);

                tau = (await ethers.provider.getBlock()).timestamp;
                await network.provider.send("evm_setNextBlockTimestamp", [tau + 10]);

                await vow.connect(deployer).flap();
                await vat.connect(multisig).hope(sikkaJoin.address)
                await sikkaJoin.connect(multisig).exit(multisig.address, "100" + wad)
                await sikka.connect(multisig).approve(jar.address, "10" + wad)
                await jar.connect(multisig).replenish("10" + wad);

                await network.provider.send("evm_mine"); // 0th second

                expect(await sikka.balanceOf(jar.address)).to.be.equal("60" + wad);

                tau = (await ethers.provider.getBlock()).timestamp;
                await network.provider.send("evm_setNextBlockTimestamp", [tau + 5]);

                vat.connect(signer2).hope(sikkaJoin.address);
                await sikkaJoin.connect(signer2).exit(signer2.address, "100" + wad);
                await sikka.connect(signer2).approve(jar.address, "100" + wad);
                await jar.connect(signer2).join("100" + wad);

                await network.provider.send("evm_mine"); // 5th

                expect(await jar.earned(signer1.address)).to.equal("5000000000000000000");

                tau = (await ethers.provider.getBlock()).timestamp;
                await network.provider.send("evm_setNextBlockTimestamp", [tau + 15]);
                                
                await sikka.connect(multisig).approve(jar.address, "10" + wad)
                await jar.connect(multisig).replenish("10" + wad);

                await network.provider.send("evm_mine"); // 0th

                expect(await jar.earned(signer1.address)).to.equal("6666666666666666650");
                expect(await jar.earned(signer2.address)).to.equal("3333333333333333300");

                tau = (await ethers.provider.getBlock()).timestamp;
                await network.provider.send("evm_setNextBlockTimestamp", [tau + 15]);
                                
                await sikka.connect(multisig).approve(jar.address, "10" + wad)
                await jar.connect(multisig).replenish("10" + wad);

                await jar.connect(signer2).exit("50" + wad);

                await network.provider.send("evm_mine"); // 0th

                expect(await jar.earned(signer1.address)).to.equal("9999999999999999950");
                expect(await jar.earned(signer2.address)).to.equal("9999999999999999900");

                tau = (await ethers.provider.getBlock()).timestamp;
                await network.provider.send("evm_setNextBlockTimestamp", [tau + 10]);
                                
                await jar.connect(signer1).exit("50" + wad);

                await jar.connect(signer2).exit("50" + wad);

                await network.provider.send("evm_mine"); // 10th

                expect(await jar.rewards(signer1.address)).to.equal("14999999999999999950");
                expect(await jar.rewards(signer2.address)).to.equal("14999999999999999900");
                
            }
        });
    })
});