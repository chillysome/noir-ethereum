import {
  Bool,
  BoundedVec,
  FixedSizeArray,
  U8,
  U64,
} from '@zkpersona/noir-helpers';

import {
  type ByteArray,
  type GetBlockParameters,
  type PublicClient,
  hexToBytes,
  toBytes,
  toRlp,
  pad,
} from 'viem';
import { parseByteArray, parseBytes32 } from './helpers';

export type GetBlockHeaderOpts = GetBlockParameters;

const toRlpBytes = (val: bigint) => {
  if (val === 0n) return new Uint8Array(0);
  return toBytes(val);
};

export const getBlockHeader = async <T extends PublicClient>(
  publicClient: T,
  opts: GetBlockHeaderOpts
) => {
  const chainId = new U64(publicClient.chain?.id ?? 1);
  const block = await publicClient.getBlock(opts);

  const headerData: ByteArray[] = [
    hexToBytes(block.parentHash),
    hexToBytes(block.sha3Uncles),
    hexToBytes(block.miner),
    hexToBytes(block.stateRoot),
    hexToBytes(block.transactionsRoot),
    hexToBytes(block.receiptsRoot),
    block.logsBloom ? hexToBytes(block.logsBloom) : new Uint8Array(256),
    toRlpBytes(block.difficulty),
    toRlpBytes(block.number ?? 0n),
    toRlpBytes(block.gasLimit),
    toRlpBytes(block.gasUsed),
    toRlpBytes(block.timestamp),
    hexToBytes(block.extraData),
    hexToBytes(block.mixHash),
    hexToBytes(
      block.nonce ? pad(block.nonce, { size: 8 }) : '0x0000000000000000'
    ),
    block.baseFeePerGas !== null ? toRlpBytes(block.baseFeePerGas!) : undefined,
    block.withdrawalsRoot ? hexToBytes(block.withdrawalsRoot) : undefined,
    block.blobGasUsed !== null ? toRlpBytes(block.blobGasUsed!) : undefined,
    block.excessBlobGas !== null ? toRlpBytes(block.excessBlobGas!) : undefined,
    block.parentBeaconBlockRoot
      ? hexToBytes(block.parentBeaconBlockRoot)
      : undefined,
    (block as any).requestsHash
      ? hexToBytes((block as any).requestsHash)
      : undefined,
  ].filter((x) => x !== undefined);

  const headerRlp = toRlp(headerData);

  const header = {
    number: new U64(block.number ?? 0n),
    hash: parseBytes32(block.hash ?? '0x0'),
    state_root: parseBytes32(block.stateRoot),
    transactions_root: parseBytes32(block.transactionsRoot),
    receipts_root: parseBytes32(block.receiptsRoot),
    withdrawals_root: block.withdrawalsRoot
      ? {
          _is_some: new Bool(true),
          _value: parseBytes32(block.withdrawalsRoot),
        }
      : { _is_some: new Bool(false), _value: new FixedSizeArray(0, []) },
  };

  return {
    chain_id: chainId,
    block_header_partial: header,
    block_header_rlp: new BoundedVec(742, new U8(0), parseByteArray(headerRlp)),
  };
};
