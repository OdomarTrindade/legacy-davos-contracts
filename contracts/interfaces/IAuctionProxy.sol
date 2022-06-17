// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./SikkaLike.sol";
import "./SikkaJoinLike.sol";
import "./VatLike.sol";
import "./ClipperLike.sol";
import "./DogLike.sol";
import { CollateralType } from "./../ceros/interfaces/IDao.sol";
import "../ceros/interfaces/ISikkaProvider.sol";

interface IAuctionProxy {

    event Liquidation(address user, address indexed collateral, uint256 amount, uint256 price);

    function startAuction(
        address token,
        address user,
        address keeper
    ) external returns (uint256 id);

    function buyFromAuction(
        address user,
        uint256 auctionId,
        uint256 collateralAmount,
        uint256 maxPrice,
        address receiverAddress
    ) external;

    function getAllActiveAuctionsForToken(address token) external view returns (Sale[] memory sales);
}
