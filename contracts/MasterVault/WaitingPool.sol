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

    /// @dev initialize function - Constructor for Upgradable contract, can be only called once during deployment
    /// @param _masterVault name of the vault token
    /// @param _capLimit symbol of the vault token
    function initialize(address _masterVault, uint256 _capLimit) external initializer {
        require(_capLimit > 0, "invalid cap limit");
        masterVault = IMasterVault(_masterVault);
        capLimit = _capLimit;
    }

    /// @dev Only masterVault can call to submit a new withdrawal request
    /// @param _person address of the withdrawer
    /// @param _debt amount that needs to be paid to _person
    /// NOTE: withdrawal and swap fees are already deducted in masterVault
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

    /// @dev Only masterVault can trigger this function to pay outstanding debt of users 
    ///      and set the settled flag on successful withdrawal.
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

    /// @dev returns the balance of this contract
    function getPoolBalance() public view returns(uint256) {
        return address(this).balance;
    }

    /// @dev users can withdraw their funds if they were transferred in tryRemove()
    function withdrawUnsettled(uint256 _index) external {
        require(
            !people[_index]._settled && 
            _index < index && 
            people[_index]._address == msg.sender,
            "already settled"
        );
        totalDebt -= people[_index]._debt;
        people[_index]._settled = true;
        payable(msg.sender).transfer(people[_index]._debt);
    }

    /// @dev only MasterVault can set new cap limit
    /// @param _capLimit new cap limit
    function setCapLimit(uint256 _capLimit) external onlyMasterVault {
        require(
            _capLimit != 0, 
            "invalid cap");
        capLimit = _capLimit;
    }
}