// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IMasterVault.sol";
contract WaitingPool is Initializable {
    IMasterVault public masterVault;
    struct Person {
        address _address;
        uint256 _debt;
        bool _settled;
    }
    Person[] public people;
    uint256 public index;
    uint256 public totalDebt;
    uint256 public capLimit;
    modifier onlyMasterVault() {
        require(msg.sender == address(masterVault));
        _;
    }
    function initialize(address _masterVault, uint256 _capLimit) external initializer {
        masterVault = IMasterVault(_masterVault);
        capLimit = _capLimit;
    }
    function addToQueue(address _person, uint256 _debt) external onlyMasterVault {
        if(_debt != 0) {
            Person memory p = Person({
                _address: _person, 
                _debt: _debt,
                _settled: false
            });
            totalDebt += _debt;
            people.push(p);
        }
    }
    function tryRemove() external onlyMasterVault {
        uint256 balance;
        uint256 cap = 0;
        for(uint256 i = index; i < people.length; i++) {
            balance = address(this).balance;
            if(
                balance >= people[index]._debt && 
                people[index]._debt != 0 &&
                !people[index]._settled && 
                cap < capLimit
            ) {
                bool success = payable(people[index]._address).send(people[index]._debt);
                if(success) {
                    totalDebt -= people[index]._debt;
                    people[index]._settled = true;
                }
                cap++;
                index++;
            } else {
                return;
            }
        }
    }
    
    receive() external payable {
    }
    function _assessFee(uint256 amount, uint256 fees) internal returns(uint256 value) {
        if(fees > 0) {
            uint256 fee = (amount * fees) / 1e6;
            value = amount - fee;
            payable(masterVault.feeReceiver()).transfer(fee);
        } else {
            return amount;
        }
    }
    function getPoolBalance() public view returns(uint256) {
        return address(this).balance;
    }
    function withdrawUnsettled(uint256 _index) external {
        require(
            !people[_index]._settled && 
            _index < index && 
            people[_index]._address == msg.sender,
            "already settled"
        );
        totalDebt -= people[index]._debt;
        people[_index]._settled = true;
        payable(msg.sender).transfer(people[index]._debt);
    }
    function setCapLimit(uint256 _capLimit) external onlyMasterVault {
        require(
            _capLimit != 0, 
            "invalid cap");
        capLimit = _capLimit;
    }
}